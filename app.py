from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from datetime import date, datetime
from models import db, Usuario, Transacao
import re
import json
import traceback
import mercadopago
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__)
app.secret_key = 'pythonlab_super_secret_key_2026'

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///usuarios.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db.init_app(app)

TOKEN = os.getenv('MERCADOPAGO_ACCESS_TOKEN')
if TOKEN:
    sdk = mercadopago.SDK(TOKEN)
    print("✅ SDK Mercado Pago inicializado")
else:
    sdk = None
    print("⚠️ Token não encontrado")

with app.app_context():
    db.create_all()

def load_modules():
    with open('data/modules.json', 'r', encoding='utf-8') as f:
        return json.load(f)

MODULES = load_modules()

# ---------- Funções de validação ----------
def validar_cpf(cpf):
    cpf = re.sub(r'\D', '', cpf)
    if len(cpf) != 11 or cpf == cpf[0] * 11:
        return False
    def calc_digito(parcial):
        soma = sum(int(cpf[i]) * (parcial - i) for i in range(parcial - 1))
        resto = soma % 11
        return 0 if resto < 2 else 11 - resto
    return calc_digito(10) == int(cpf[9]) and calc_digito(11) == int(cpf[10])

def validar_email(email):
    regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(regex, email) is not None

def calcular_idade(nascimento):
    hoje = date.today()
    return hoje.year - nascimento.year - ((hoje.month, hoje.day) < (nascimento.month, nascimento.day))

# ---------- Rotas ----------
@app.route('/')
def landing():
    return render_template('landing.html')

@app.route('/checkout')
def checkout():
    return render_template('cadastro.html')

@app.route('/login')
def login_page():
    return render_template('login.html')

@app.route('/cadastrar', methods=['POST'])
def cadastrar():
    try:
        data = request.get_json()
        nome = data.get('nome', '').strip()
        email = data.get('email', '').strip()
        cpf = data.get('cpf', '').strip()
        senha = data.get('senha', '')
        data_nasc_str = data.get('data_nascimento', '')

        if not all([nome, email, cpf, senha, data_nasc_str]):
            return jsonify({'success': False, 'message': 'Todos os campos são obrigatórios.'})
        if not validar_email(email):
            return jsonify({'success': False, 'message': 'E-mail inválido.'})
        if not validar_cpf(cpf):
            return jsonify({'success': False, 'message': 'CPF inválido.'})
        if len(senha) < 6:
            return jsonify({'success': False, 'message': 'Senha deve ter pelo menos 6 caracteres.'})

        nascimento = datetime.strptime(data_nasc_str, '%Y-%m-%d').date()
        idade = calcular_idade(nascimento)
        if idade < 18:
            return jsonify({'success': False, 'message': f'Você tem {idade} anos. Necessário 18 anos ou mais.'})

        if Usuario.query.filter((Usuario.email == email) | (Usuario.cpf == cpf)).first():
            return jsonify({'success': False, 'message': 'E-mail ou CPF já cadastrado.'})

        novo = Usuario(
            nome=nome,
            email=email,
            cpf=re.sub(r'\D', '', cpf),
            data_nascimento=nascimento,
            payment_status='pending'
        )
        novo.set_senha(senha)
        db.session.add(novo)
        db.session.commit()

        session['user'] = novo.nome
        session['user_id'] = novo.id

        # Gera QR Code PIX com valor FIXO (19.99)
        if sdk:
            try:
                preference_data = {
                    "items": [{
                        "title": "Curso PythonLab - Acesso Vitalício",
                        "quantity": 1,
                        "currency_id": "BRL",
                        "unit_price": 19.99  # VALOR FIXO
                    }],
                    "payer": {"email": email, "name": nome},
                    "external_reference": str(novo.id),
                    "payment_methods": {"installments": 1},
                    "expires": True,
                    "expiration_date_to": (datetime.now().replace(minute=datetime.now().minute + 30)).isoformat()
                }
                result = sdk.preference().create(preference_data)
                if result["status"] == 201:
                    pref = result["response"]
                    qr_code_base64 = pref["point_of_interaction"]["transaction_data"]["qr_code_base64"]
                    qr_code = pref["point_of_interaction"]["transaction_data"]["qr_code"]
                    transacao = Transacao(
                        user_id=novo.id,
                        preference_id=pref["id"],
                        status='pending',
                        qr_code=qr_code,
                        qr_code_base64=qr_code_base64,
                        valor=19.99
                    )
                    db.session.add(transacao)
                    db.session.commit()
            except Exception as e:
                print("Erro ao criar preferência:", e)
                # Fallback: cria transação sem QR (será tratado na página de pagamento)
        return jsonify({'success': True, 'redirect': '/pagamento'})
    except Exception as e:
        print(traceback.format_exc())
        return jsonify({'success': False, 'message': 'Erro interno no servidor.'}), 500

@app.route('/logar', methods=['POST'])
def logar():
    data = request.get_json()
    email = data.get('email')
    senha = data.get('senha')
    usuario = Usuario.query.filter_by(email=email).first()
    if not usuario or not usuario.verificar_senha(senha):
        return jsonify({'success': False, 'message': 'E-mail ou senha inválidos'})
    session['user'] = usuario.nome
    session['user_id'] = usuario.id
    if usuario.payment_status == 'approved':
        return jsonify({'success': True, 'redirect': '/dashboard'})
    else:
        return jsonify({'success': True, 'redirect': '/pagamento'})

@app.route('/pagamento')
def pagamento():
    if 'user_id' not in session:
        return redirect(url_for('checkout'))
    user_id = session['user_id']
    usuario = Usuario.query.get(user_id)
    if usuario.payment_status == 'approved':
        return redirect(url_for('dashboard'))
    
    transacao = Transacao.query.filter_by(user_id=user_id, status='pending').first()
    if not transacao or not transacao.qr_code_base64:
        # Tenta criar novamente (fallback)
        # Redireciona para checkout para recriar a transação
        return redirect(url_for('checkout'))
    
    return render_template('pagamento.html', 
                           qr_code_base64=transacao.qr_code_base64, 
                           preference_id=transacao.preference_id, 
                           user_name=usuario.nome,
                           valor=19.99)

@app.route('/verificar-pagamento/<preference_id>', methods=['GET'])
def verificar_pagamento(preference_id):
    if 'user_id' not in session:
        return jsonify({'success': False, 'message': 'Não autenticado'})
    transacao = Transacao.query.filter_by(preference_id=preference_id).first()
    if transacao and transacao.status == 'approved':
        return jsonify({'success': True, 'redirect': '/dashboard'})
    
    # Consulta API do Mercado Pago
    if sdk:
        try:
            payment_result = sdk.payment().search(filters={"external_reference": str(transacao.user_id)})
            for payment in payment_result["response"]["results"]:
                if payment["status"] == "approved" and payment["transaction_amount"] == 19.99:
                    transacao.status = 'approved'
                    transacao.data_pagamento = datetime.utcnow()
                    usuario = Usuario.query.get(transacao.user_id)
                    usuario.payment_status = 'approved'
                    db.session.commit()
                    return jsonify({'success': True, 'redirect': '/dashboard'})
        except Exception as e:
            print("Erro na consulta:", e)
    return jsonify({'success': False, 'message': 'Aguardando pagamento...'})

@app.route('/webhook', methods=['POST'])
def webhook():
    """Recebe notificações do Mercado Pago e valida o valor"""
    try:
        data = request.get_json()
        print("Webhook recebido:", data)
        if data and data.get('type') == 'payment':
            payment_id = data['data']['id']
            if sdk:
                payment_info = sdk.payment().get(payment_id)["response"]
                if payment_info["status"] == "approved":
                    # Verifica se o valor é exatamente 19.99
                    if payment_info["transaction_amount"] != 19.99:
                        print(f"Pagamento com valor incorreto: {payment_info['transaction_amount']}")
                        return "Valor incorreto", 400
                    external_ref = payment_info.get("external_reference")
                    if external_ref:
                        user_id = int(external_ref)
                        usuario = Usuario.query.get(user_id)
                        if usuario and usuario.payment_status != 'approved':
                            usuario.payment_status = 'approved'
                            transacao = Transacao.query.filter_by(user_id=user_id, status='pending').first()
                            if transacao:
                                transacao.status = 'approved'
                                transacao.data_pagamento = datetime.utcnow()
                            db.session.commit()
                            print(f"✅ Acesso liberado para {usuario.nome}")
        return "OK", 200
    except Exception as e:
        print(traceback.format_exc())
        return "ERRO", 500

# ---------- Rotas do Dashboard ----------
@app.route('/dashboard')
def dashboard():
    if 'user_id' not in session:
        return redirect(url_for('checkout'))
    usuario = Usuario.query.get(session['user_id'])
    if usuario.payment_status != 'approved':
        return redirect(url_for('pagamento'))
    return render_template('dashboard.html', user=session['user'], modules=MODULES)

@app.route('/api/modules')
def api_modules():
    return jsonify(MODULES)

@app.route('/api/submit-quiz', methods=['POST'])
def submit_quiz():
    if 'user' not in session:
        return jsonify({'error': 'Não autenticado'}), 401
    data = request.get_json()
    module_id = str(data.get('module_id'))
    selected = int(data.get('selected_option'))
    module = MODULES[int(module_id)]
    is_correct = (selected == module['quiz']['correct'])
    if 'progress' not in session:
        session['progress'] = {}
    if is_correct:
        session['progress'][module_id] = True
    session.modified = True
    return jsonify({
        'correct': is_correct,
        'explanation': module['quiz']['explanation'],
        'progress': session['progress']
    })

@app.route('/api/progress')
def get_progress():
    if 'user' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    return jsonify(session.get('progress', {}))

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('landing'))

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)