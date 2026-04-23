document.addEventListener('DOMContentLoaded', function() {
    // ==================== TELA DE ACESSO (INDEX) ====================
    const btnLogin = document.getElementById('btnLogin');
    const btnCadastro = document.getElementById('btnCadastro');

    if (btnLogin) {
        btnLogin.addEventListener('click', async () => {
            const email = document.getElementById('loginEmail').value.trim();
            const senha = document.getElementById('loginSenha').value;
            const errorDiv = document.getElementById('errorMsg');

            if (!email || !senha) {
                errorDiv.innerText = 'Preencha e-mail e senha.';
                errorDiv.classList.remove('hidden');
                return;
            }
            try {
                const res = await fetch('/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, senha })
                });
                const data = await res.json();
                if (data.success) {
                    window.location.href = data.redirect;
                } else {
                    errorDiv.innerText = data.message;
                    errorDiv.classList.remove('hidden');
                }
            } catch (err) {
                errorDiv.innerText = 'Erro de conexão.';
                errorDiv.classList.remove('hidden');
            }
        });
    }

    if (btnCadastro) {
        btnCadastro.addEventListener('click', async () => {
            const nome = document.getElementById('cadastroNome').value.trim();
            const email = document.getElementById('cadastroEmail').value.trim();
            const cpf = document.getElementById('cadastroCpf').value.replace(/\D/g, '');
            const dataNascimento = document.getElementById('cadastroDataNasc').value;
            const senha = document.getElementById('cadastroSenha').value;
            const errorDiv = document.getElementById('errorMsg');

            if (!nome || !email || !cpf || !dataNascimento || !senha) {
                errorDiv.innerText = 'Todos os campos são obrigatórios.';
                errorDiv.classList.remove('hidden');
                return;
            }
            if (senha.length < 6) {
                errorDiv.innerText = 'A senha deve ter pelo menos 6 caracteres.';
                errorDiv.classList.remove('hidden');
                return;
            }
            try {
                const res = await fetch('/cadastrar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nome, email, cpf, data_nascimento: dataNascimento, senha })
                });
                const data = await res.json();
                if (data.success) {
                    window.location.href = data.redirect;
                } else {
                    errorDiv.innerText = data.message;
                    errorDiv.classList.remove('hidden');
                }
            } catch (err) {
                errorDiv.innerText = 'Erro de conexão com o servidor.';
                errorDiv.classList.remove('hidden');
            }
        });
    }

    // ==================== DASHBOARD ====================
    if (document.getElementById('modulesGrid')) {
        carregarDashboard();
    }
});

// Variáveis globais do dashboard
let modules = [];
let currentModuleId = 0;
let userProgress = {};

async function carregarDashboard() {
    try {
        const modulesRes = await fetch('/api/modules');
        modules = await modulesRes.json();
        const progressRes = await fetch('/api/progress');
        if (progressRes.ok) userProgress = await progressRes.json();
        else userProgress = {};
        renderModulesGrid();
        updateProgressUI();
        updateModuleBadges();
        const primeiroNaoConcluido = modules.find(m => !userProgress[m.id]);
        currentModuleId = primeiroNaoConcluido ? primeiroNaoConcluido.id : modules[0].id;
        loadModule(currentModuleId);
    } catch (err) {
        console.error(err);
        document.getElementById('teachingArea').innerHTML = '<div class="text-red-400 text-center p-8">Erro ao carregar conteúdo.</div>';
    }
}

function renderModulesGrid() {
    const grid = document.getElementById('modulesGrid');
    grid.innerHTML = '';
    modules.forEach(mod => {
        const card = document.createElement('div');
        card.className = `module-card glass-card rounded-xl p-5 cursor-pointer transition-all hover:scale-105 hover:border-blue-500 border border-transparent ${currentModuleId === mod.id ? 'active' : ''}`;
        card.dataset.id = mod.id;
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <i class="fab fa-python text-3xl text-blue-400"></i>
                <span class="module-badge text-xs bg-gray-800 px-2 py-1 rounded-full">📘 Pendente</span>
            </div>
            <h3 class="text-xl font-bold text-white mt-3">${mod.title}</h3>
            <p class="text-gray-400 text-sm mt-2">${mod.summary}</p>
        `;
        card.addEventListener('click', () => {
            currentModuleId = mod.id;
            renderModulesGrid();
            loadModule(currentModuleId);
        });
        grid.appendChild(card);
    });
}

async function loadModule(moduleId) {
    const mod = modules.find(m => m.id == moduleId);
    if (!mod) return;
    const alreadyDone = userProgress[moduleId] === true;
    const savedAnswer = localStorage.getItem(`quiz_${moduleId}`);
    let quizHtml = `
        <div class="mt-6 border-t border-gray-700 pt-6">
            <h3 class="text-xl font-semibold text-white mb-3"><i class="fas fa-question-circle text-blue-400 mr-2"></i>Quiz</h3>
            <p class="text-gray-200 mb-3">${mod.quiz.question}</p>
            <div class="space-y-2" id="quizOptions">
    `;
    mod.quiz.options.forEach((opt, idx) => {
        const checked = (savedAnswer == idx) ? 'checked' : '';
        quizHtml += `
            <label class="flex items-center space-x-3 bg-gray-800 p-2 rounded-lg cursor-pointer quiz-option">
                <input type="radio" name="quiz" value="${idx}" ${checked} ${alreadyDone ? 'disabled' : ''}>
                <span class="text-gray-300">${opt}</span>
            </label>
        `;
    });
    quizHtml += `</div><div id="quizFeedback" class="mt-3 text-sm"></div>`;
    if (!alreadyDone) {
        quizHtml += `<button id="submitQuiz" class="mt-4 bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-full text-white font-semibold transition"><i class="fas fa-check mr-2"></i>Responder</button>`;
    } else {
        const isCorrect = (savedAnswer == mod.quiz.correct);
        quizHtml += `<div class="mt-3 p-3 rounded-lg ${isCorrect ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}"><i class="fas ${isCorrect ? 'fa-check-circle' : 'fa-times-circle'} mr-2"></i>${mod.quiz.explanation}</div>`;
    }
    quizHtml += `</div>`;
    const fullHtml = `
        <div class="prose prose-invert max-w-none">
            <h2 class="text-2xl font-bold gradient-text">${mod.title}</h2>
            <div class="mt-4 text-gray-200 leading-relaxed">${mod.lesson}</div>
        </div>
        ${quizHtml}
    `;
    const teachingArea = document.getElementById('teachingArea');
    teachingArea.innerHTML = fullHtml;
    teachingArea.classList.remove('hidden');
    if (!alreadyDone) {
        const submitBtn = document.getElementById('submitQuiz');
        if (submitBtn) {
            submitBtn.addEventListener('click', async () => {
                const selected = document.querySelector('input[name="quiz"]:checked');
                if (!selected) {
                    document.getElementById('quizFeedback').innerHTML = '<span class="text-yellow-400">Selecione uma opção!</span>';
                    return;
                }
                const chosen = parseInt(selected.value);
                try {
                    const res = await fetch('/api/submit-quiz', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ module_id: moduleId, selected_option: chosen })
                    });
                    const data = await res.json();
                    if (data.correct) {
                        document.getElementById('quizFeedback').innerHTML = `<span class="text-green-400">${data.explanation}</span>`;
                        userProgress = data.progress;
                        updateProgressUI();
                        updateModuleBadges();
                        localStorage.setItem(`quiz_${moduleId}`, chosen);
                        loadModule(moduleId);
                    } else {
                        document.getElementById('quizFeedback').innerHTML = `<span class="text-red-400">${data.explanation}</span>`;
                    }
                } catch (err) {
                    document.getElementById('quizFeedback').innerHTML = '<span class="text-red-400">Erro ao enviar resposta.</span>';
                }
            });
        }
    }
}

function updateProgressUI() {
    const total = modules.length;
    const completed = Object.values(userProgress).filter(v => v === true).length;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    const progressBar = document.getElementById('progressBar');
    const progressPercent = document.getElementById('progressPercent');
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressPercent) progressPercent.innerText = `${percent}%`;
}

function updateModuleBadges() {
    document.querySelectorAll('.module-card').forEach(card => {
        const id = parseInt(card.dataset.id);
        const badge = card.querySelector('.module-badge');
        if (userProgress[id] === true) {
            badge.innerHTML = '✅ Concluído';
            badge.classList.add('bg-green-800', 'text-green-200');
            badge.classList.remove('bg-gray-800');
        } else {
            badge.innerHTML = '📘 Pendente';
            badge.classList.remove('bg-green-800', 'text-green-200');
            badge.classList.add('bg-gray-800');
        }
    });
}