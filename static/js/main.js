// Registra GSAP e ScrollTrigger
gsap.registerPlugin(ScrollTrigger);

// Variáveis globais
let modules = [];
let currentModuleId = 0;
let userProgress = {};

// Função auxiliar para mostrar toast
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    const icon = type === 'success' ? 'fa-check-circle' : (type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle');
    toast.className = `toast glass-card rounded-lg p-3 mb-2 flex items-center gap-2 text-${type === 'success' ? 'green' : (type === 'error' ? 'red' : 'blue')}-400`;
    toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// Carregar dashboard
async function carregarDashboard() {
    try {
        const resMod = await fetch('/api/modules');
        modules = await resMod.json();
        const resProg = await fetch('/api/progress');
        if (resProg.ok) userProgress = await resProg.json();
        renderModulesGrid();
        updateProgressUI();
        updateModuleBadges();
        const primeiroNaoConcluido = modules.find(m => !userProgress[m.id]);
        currentModuleId = primeiroNaoConcluido ? primeiroNaoConcluido.id : modules[0].id;
        loadModule(currentModuleId);
        // Animação de entrada dos cards
        gsap.fromTo('.module-card', 
            { opacity: 0, scale: 0.9 },
            { opacity: 1, scale: 1, duration: 0.5, stagger: 0.1, scrollTrigger: { trigger: '#modulesGrid', start: 'top 80%' } }
        );
    } catch(e) {
        document.getElementById('teachingArea').innerHTML = '<div class="text-red-400 p-8 text-center">Erro ao carregar módulos. Recarregue a página.</div>';
    }
}

function renderModulesGrid() {
    const grid = document.getElementById('modulesGrid');
    if (!grid) return;
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
            // Animação de clique
            gsap.to(card, { scale: 0.98, duration: 0.1, yoyo: true, repeat: 1 });
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
    let quizHtml = `<div class="mt-6 border-t border-gray-700 pt-6"><h3 class="text-xl font-semibold text-white mb-3"><i class="fas fa-question-circle text-blue-400 mr-2"></i>Quiz</h3><p class="text-gray-200 mb-3">${mod.quiz.question}</p><div class="space-y-2" id="quizOptions">`;
    mod.quiz.options.forEach((opt, idx) => {
        const checked = (savedAnswer == idx) ? 'checked' : '';
        quizHtml += `<label class="flex items-center space-x-3 bg-gray-800 p-2 rounded-lg cursor-pointer quiz-option transition hover:bg-gray-700"><input type="radio" name="quiz" value="${idx}" ${checked} ${alreadyDone ? 'disabled' : ''}><span class="text-gray-300">${opt}</span></label>`;
    });
    quizHtml += `</div><div id="quizFeedback" class="mt-3 text-sm"></div>`;
    if (!alreadyDone) {
        quizHtml += `<button id="submitQuiz" class="mt-4 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-700 hover:to-cyan-600 px-6 py-2 rounded-full text-white font-semibold transition transform hover:scale-105"><i class="fas fa-check mr-2"></i>Responder</button>`;
    } else {
        const isCorrect = (savedAnswer == mod.quiz.correct);
        quizHtml += `<div class="mt-3 p-3 rounded-lg ${isCorrect ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}"><i class="fas ${isCorrect ? 'fa-check-circle' : 'fa-times-circle'} mr-2"></i>${mod.quiz.explanation}</div>`;
    }
    quizHtml += `</div>`;
    const fullHtml = `<div class="prose prose-invert max-w-none"><h2 class="text-2xl font-bold gradient-text">${mod.title}</h2><div class="mt-4 text-gray-200 leading-relaxed">${mod.lesson}</div></div>${quizHtml}`;
    const area = document.getElementById('teachingArea');
    area.innerHTML = fullHtml;
    area.classList.remove('hidden');
    gsap.fromTo(area, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5 });

    if (!alreadyDone) {
        document.getElementById('submitQuiz').addEventListener('click', async () => {
            const selected = document.querySelector('input[name="quiz"]:checked');
            if (!selected) {
                const fb = document.getElementById('quizFeedback');
                fb.innerHTML = '<span class="text-yellow-400"><i class="fas fa-exclamation-triangle mr-1"></i>Selecione uma opção!</span>';
                gsap.to(fb, { scale: 1.05, duration: 0.2, yoyo: true, repeat: 1 });
                return;
            }
            const chosen = parseInt(selected.value);
            const btn = document.getElementById('submitQuiz');
            const originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Verificando...';
            try {
                const res = await fetch('/api/submit-quiz', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ module_id: moduleId, selected_option: chosen })
                });
                const data = await res.json();
                if (data.correct) {
                    document.getElementById('quizFeedback').innerHTML = `<span class="text-green-400"><i class="fas fa-check-circle mr-1"></i>${data.explanation}</span>`;
                    userProgress = data.progress;
                    updateProgressUI();
                    updateModuleBadges();
                    localStorage.setItem(`quiz_${moduleId}`, chosen);
                    showToast('✅ Resposta correta! Módulo concluído.', 'success');
                    loadModule(moduleId);
                } else {
                    document.getElementById('quizFeedback').innerHTML = `<span class="text-red-400"><i class="fas fa-times-circle mr-1"></i>${data.explanation}</span>`;
                    showToast('❌ Resposta errada. Tente novamente.', 'error');
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                }
            } catch(e) {
                document.getElementById('quizFeedback').innerHTML = '<span class="text-red-400">Erro ao enviar resposta.</span>';
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        });
    }
}

function updateProgressUI() {
    const total = modules.length;
    const completed = Object.values(userProgress).filter(v => v === true).length;
    const percent = total ? Math.round((completed / total) * 100) : 0;
    const bar = document.getElementById('progressBar');
    const txt = document.getElementById('progressPercent');
    if (bar) {
        gsap.to(bar, { width: `${percent}%`, duration: 0.8, ease: 'power2.out' });
    }
    if (txt) txt.innerText = `${percent}%`;
    if (percent === 100 && total > 0) {
        showToast('🎉 Parabéns! Você concluiu todos os módulos!', 'success');
    }
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

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('modulesGrid')) {
        carregarDashboard();
    }
});