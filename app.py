from flask import Flask, render_template, request, jsonify, session
from datetime import date, datetime
from models import db, Usuario
import re
import json
import os
import traceback

app = Flask(__name__)
app.secret_key = 'pythonlab_secret_key_2026'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///usuarios.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

# Criar tabelas se não existirem
with app.app_context():
    db.create_all()
    print("✅ Banco de dados e tabelas verificados/criados.")

# Carregar módulos de ensino
def load_modules():
    modules_path = os.path.join('data', 'modules.json')
    with open(modules_path, 'r', encoding='utf-8') as f:
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
def index():
    return render_template('index.html')

@app.route('/cadastrar', methods=['POST'])
def cadastrar():
    try:
        data = request.get_json()
        print("📥 Cadastro recebido:", data)

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
            return jsonify({'success': False, 'message': 'A senha deve ter pelo menos 6 caracteres.'})

        try:
            nascimento = datetime.strptime(data_nasc_str, '%Y-%m-%d').date()
            idade = calcular_idade(nascimento)
            if idade < 18:
                return jsonify({'success': False, 'message': f'Você tem {idade} anos. Necessário 18 anos ou mais.'})
        except ValueError:
            return jsonify({'success': False, 'message': 'Data de nascimento inválida.'})

        # Verificar duplicidade
        if Usuario.query.filter((Usuario.email == email) | (Usuario.cpf == cpf)).first():
            return jsonify({'success': False, 'message': 'E-mail ou CPF já cadastrado.'})

        novo = Usuario(
            nome=nome,
            email=email,
            cpf=re.sub(r'\D', '', cpf),
            data_nascimento=nascimento
        )
        novo.set_senha(senha)
        db.session.add(novo)
        db.session.commit()

        session['user'] = novo.nome
        session['user_id'] = novo.id
        session['progress'] = {str(i): False for i in range(len(MODULES))}

        return jsonify({'success': True, 'redirect': '/dashboard'})

    except Exception as e:
        print("❌ ERRO no cadastro:")
        traceback.print_exc()
        return jsonify({'success': False, 'message': f'Erro interno: {str(e)}'}), 500

@app.route('/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        email = data.get('email', '').strip()
        senha = data.get('senha', '')

        if not email or not senha:
            return jsonify({'success': False, 'message': 'E-mail e senha são obrigatórios.'})

        usuario = Usuario.query.filter_by(email=email).first()
        if not usuario or not usuario.verificar_senha(senha):
            return jsonify({'success': False, 'message': 'E-mail ou senha inválidos.'})

        session['user'] = usuario.nome
        session['user_id'] = usuario.id
        if 'progress' not in session:
            session['progress'] = {str(i): False for i in range(len(MODULES))}

        return jsonify({'success': True, 'redirect': '/dashboard'})

    except Exception as e:
        print("❌ ERRO no login:")
        traceback.print_exc()
        return jsonify({'success': False, 'message': 'Erro interno no servidor.'}), 500

@app.route('/dashboard')
def dashboard():
    if 'user' not in session:
        return render_template('index.html', error='Faça login ou cadastre-se primeiro.')
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

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)