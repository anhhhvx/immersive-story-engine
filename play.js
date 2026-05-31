let storyData = [];
let playerInventory = [];
let currentNodeIndex = 0;
let isTyping = false;
let typingSpeed = 30;
let typeTimeout;

let isWaitingForChoice = false;
let isWaitingForEvidence = false;
let selectedEvidenceId = null;

let activeCE = null;
let currentHP = 10;
const MAX_HP = 10;

const bgmPlayer = new Audio(); bgmPlayer.loop = true;
const sfxPlayer = new Audio();

// TẢI DỮ LIỆU TỪ TRÌNH DUYỆT HOẶC FILE JSON
async function loadGameData() {
    try {
        const response = await fetch('story_data.json', { cache: 'no-store' });
        if (response.ok) {
            const fileData = await response.json();
            storyData = Array.isArray(fileData) ? fileData : (fileData.scenes || []);
            return;
        }
    } catch(e) {}
    
    const savedData = localStorage.getItem('storyData');
    if (savedData) storyData = JSON.parse(savedData);
}

// BẮT ĐẦU GAME KHI BẤM NÚT START
async function startGame() {
    await loadGameData();
    if (storyData.length === 0) {
        alert("Chưa có kịch bản! Vui lòng tạo kịch bản từ Editor.");
        return;
    }
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('game-wrapper').style.display = 'block';
    playNode(storyData[0].id);
}

// --- LOGIC PLAY GAME (Giống hệt engine.js) ---
function renderHPBar(state, amount) {
    const bar = document.getElementById('penalty-bar'); bar.innerHTML = '';
    for (let i = 1; i <= MAX_HP; i++) {
        const seg = document.createElement('div'); seg.className = 'hp-seg';
        if (state === 'damage') { if (i > currentHP && i <= currentHP + amount) seg.classList.add('damage'); else if (i <= currentHP) seg.classList.add('active'); }
        else if (state === 'warning') { if (i <= currentHP) { if (i > currentHP - amount) seg.classList.add('throbbing'); else seg.classList.add('active'); } }
        else { if (i <= currentHP) seg.classList.add('active'); }
        bar.appendChild(seg);
    }
}

function renderCEDots(currentIndex, total) {
    const container = document.getElementById('ce-dots-container'); container.innerHTML = '';
    for(let i=0; i<total; i++) {
        const dot = document.createElement('span'); dot.className = i === currentIndex ? 'ce-dot active' : 'ce-dot';
        container.appendChild(dot);
    }
}
function goNextTestimony() {
    if(!activeCE || isTyping) return;
    const idx = activeCE.testimonies.indexOf(storyData[currentNodeIndex].id);
    if(idx !== -1) {
        if(idx < activeCE.testimonies.length - 1) playNode(activeCE.testimonies[idx + 1]);
        else if (activeCE.hintNode) playNode(activeCE.hintNode);
        else playNode(activeCE.testimonies[0]);
    }
}
function goPrevTestimony() {
    if(!activeCE || isTyping) return;
    const idx = activeCE.testimonies.indexOf(storyData[currentNodeIndex].id);
    if(idx > 0) playNode(activeCE.testimonies[idx - 1]);
}

function playNode(nodeId) {
    const nodeIndex = storyData.findIndex(s => s.id === nodeId);
    if (nodeIndex === -1) return;
    const node = storyData[nodeIndex]; currentNodeIndex = nodeIndex;

    // Cross-Examination Logic
    if (node.ceSetup && node.ceSetup.testimonies && node.ceSetup.testimonies.length > 0) {
        activeCE = { testimonies: [...node.ceSetup.testimonies], hintNode: node.ceSetup.hintNode, allPressedNode: node.ceSetup.allPressedNode, failEvNode: node.ceSetup.failEvNode, pressedSet: new Set() };
        playNode(activeCE.testimonies[0]); return;
    }
    if (node.ceAdd && node.ceAdd.newId && activeCE) {
        if (!activeCE.testimonies.includes(node.ceAdd.newId)) {
            const idx = activeCE.testimonies.indexOf(node.ceAdd.afterId);
            if (idx !== -1) activeCE.testimonies.splice(idx + 1, 0, node.ceAdd.newId);
            else activeCE.testimonies.push(node.ceAdd.newId);
        }
    }
    let ceIdx = activeCE ? activeCE.testimonies.indexOf(nodeId) : -1;
    if (activeCE && ceIdx !== -1 && activeCE.allPressedNode && activeCE.pressedSet.size >= activeCE.testimonies.length) {
        const target = activeCE.allPressedNode; activeCE = null; playNode(target); return;
    }

    const ceUI = document.getElementById('ce-ui'); const actionHints = document.getElementById('action-hints');
    ceUI.style.display = 'none'; actionHints.style.display = 'none';
    if (ceIdx !== -1) {
        document.getElementById('ce-arrow-left').style.display = ceIdx > 0 ? 'block' : 'none';
        document.getElementById('ce-arrow-right').style.display = 'block';
        renderCEDots(ceIdx, activeCE.testimonies.length);
        ceUI.style.display = 'block'; actionHints.style.display = 'block';
    }

    // Visuals
    const bgLayer = document.getElementById('background-layer');
    const charSprite = document.getElementById('character-sprite');
    const config = node.visualConfig;
    bgLayer.style.backgroundImage = (config && config.bgUrl) ? `url('${config.bgUrl}')` : '';
    bgLayer.className = (config && config.bgVfx) ? config.bgVfx : "";

    const charSrc = node.characterSprite || (config ? config.charUrl : "");
    if (charSrc) { charSprite.src = charSrc; charSprite.style.display = "block"; } else charSprite.style.display = "none";
    charSprite.className = (config && config.charVfx) ? config.charVfx : "";

    // Audio
    if (node.audio) {
        if (node.audio.action === "stop") { bgmPlayer.pause(); bgmPlayer.currentTime = 0; }
        else if (node.audio.action === "play" && node.audio.url) { 
            if (bgmPlayer.src !== node.audio.url) { bgmPlayer.src = node.audio.url; bgmPlayer.play().catch(e=>{}); }
        }
    }
    if (node.sfxUrl) { sfxPlayer.src = node.sfxUrl; sfxPlayer.currentTime = 0; sfxPlayer.play().catch(e=>{}); }

    // Health
    let hpState = node.hpConfig ? node.hpConfig.state : 'hidden';
    let hpAmount = node.hpConfig ? node.hpConfig.amount : 0;
    if (activeCE !== null && hpState === 'hidden') hpState = 'visible';

    const hpContainer = document.getElementById('penalty-container');
    if (hpState === 'hidden') hpContainer.classList.remove('show');
    else {
        hpContainer.classList.add('show');
        if (hpState === 'damage' && (!node.hpConfig || !node.hpConfig.applied)) {
            currentHP -= hpAmount; if (currentHP < 0) currentHP = 0;
            if (node.hpConfig) node.hpConfig.applied = true;
        }
        renderHPBar(hpState, hpAmount);
        if (currentHP <= 0 && hpState === 'damage') setTimeout(() => { alert("Luật sư đã mất toàn bộ sự tín nhiệm! GAME OVER."); }, 1000);
    }

    // Text & Items
    document.getElementById('character-name').textContent = node.characterName;
    const addedPopup = document.getElementById('evidence-added-popup'); if (addedPopup) addedPopup.style.display = 'none';
    if (node.addEvidence) {
        const ev = node.addEvidence;
        if (!playerInventory.find(item => item.id === ev.id)) playerInventory.push(ev);
        if (addedPopup) {
            document.getElementById('ev-added-name').textContent = ev.name; document.getElementById('ev-added-desc').textContent = ev.desc;
            document.getElementById('ev-added-img').src = ev.img || ''; addedPopup.style.display = 'flex';
        }
    }
    
    const choiceContainer = document.getElementById('choice-container');
    choiceContainer.innerHTML = ''; 
    if (node.choices && node.choices.length > 0 && !node.evidenceChallenge) {
        isWaitingForChoice = true; choiceContainer.style.display = 'none'; 
        node.choices.forEach(choice => {
            const btn = document.createElement('button'); btn.className = 'choice-btn'; btn.textContent = choice.text;
            btn.onclick = (e) => { e.stopPropagation(); choiceContainer.style.display = 'none'; isWaitingForChoice = false; playNode(choice.nextNode); };
            choiceContainer.appendChild(btn);
        });
    } else { isWaitingForChoice = false; }
    
    document.getElementById('dialogue-text').textContent = ""; isTyping = true; typeWriter(node.dialogueText, 0);
}

function typeWriter(text, charIndex) {
    if (charIndex < text.length) {
        document.getElementById('dialogue-text').textContent += text.charAt(charIndex); charIndex++;
        typeTimeout = setTimeout(() => typeWriter(text, charIndex), typingSpeed);
    } else {
        isTyping = false; const node = storyData[currentNodeIndex];
        if (node.evidenceChallenge && !node.pressNode) {
            if(!activeCE || activeCE.testimonies.indexOf(node.id) === -1) {
                isWaitingForEvidence = true; renderInventoryUI(); document.getElementById('inventory-ui').style.display = 'flex';
            }
        } else if (node.choices && node.choices.length > 0) document.getElementById('choice-container').style.display = 'flex';
    }
}

function renderInventoryUI() {
    const grid = document.getElementById('evidence-grid'); grid.innerHTML = ''; selectedEvidenceId = null;
    document.getElementById('ev-name').textContent = "Chọn bằng chứng"; document.getElementById('ev-desc').textContent = "";
    playerInventory.forEach(item => {
        const div = document.createElement('div'); div.className = 'ev-item'; div.innerHTML = `<img src="${item.img}">`;
        div.onclick = (e) => {
            e.stopPropagation(); document.querySelectorAll('.ev-item').forEach(el => el.classList.remove('selected'));
            div.classList.add('selected'); selectedEvidenceId = item.id;
            document.getElementById('ev-name').textContent = item.name; document.getElementById('ev-desc').textContent = item.desc;
        };
        grid.appendChild(div);
    });
}

// EVENTS
document.addEventListener('keydown', (e) => {
    if (storyData.length === 0 || document.getElementById('start-screen').style.display !== 'none') return;
    const node = storyData[currentNodeIndex];
    const ceIdx = activeCE ? activeCE.testimonies.indexOf(node.id) : -1;

    if (e.key.toLowerCase() === 'q' && ceIdx !== -1 && !isTyping) {
        if (node.pressNode) { activeCE.pressedSet.add(node.id); playNode(node.pressNode); }
    }
    else if (e.key.toLowerCase() === 'e' && !isTyping) {
        const ui = document.getElementById('inventory-ui');
        if (ui.style.display !== 'flex' && (node.evidenceChallenge || ceIdx !== -1)) {
            isWaitingForEvidence = true; renderInventoryUI(); ui.style.display = 'flex'; return;
        }
        if (ui.style.display === 'flex') {
            if (!selectedEvidenceId) { alert("Chưa chọn bằng chứng!"); return; }
            ui.style.display = 'none'; isWaitingForEvidence = false;
            if (node.evidenceChallenge && selectedEvidenceId === node.evidenceChallenge.correctId) {
                activeCE = null; playNode(node.evidenceChallenge.passNode);
            } else {
                if (node.evidenceChallenge && node.evidenceChallenge.failNode) playNode(node.evidenceChallenge.failNode); 
                else if (activeCE && activeCE.failEvNode) playNode(activeCE.failEvNode); 
                else alert("Trình sai bằng chứng!");
            }
        }
    }
    else if (e.key === 'ArrowLeft') goPrevTestimony();
    else if (e.key === 'ArrowRight') goNextTestimony();
});

document.addEventListener('click', (e) => {
    if (document.getElementById('start-screen').style.display !== 'none') return;
    if (e.target.closest('#inventory-ui') || e.target.closest('.ce-arrow')) return;
    if ((isWaitingForChoice || isWaitingForEvidence) && !isTyping) return; 
    if (storyData.length === 0) return;
    const node = storyData[currentNodeIndex];
    
    if (isTyping) {
        clearTimeout(typeTimeout); document.getElementById('dialogue-text').textContent = node.dialogueText; isTyping = false;
        if (node.choices && node.choices.length > 0) document.getElementById('choice-container').style.display = 'flex';
    } else {
        const ceIdx = activeCE ? activeCE.testimonies.indexOf(node.id) : -1;
        if (ceIdx !== -1) goNextTestimony(); 
        else if (node.nextNode === "end") { document.getElementById('character-name').textContent = "Hệ thống"; document.getElementById('dialogue-text').textContent = "--- KẾT THÚC ---"; } 
        else if (!isWaitingForChoice && !isWaitingForEvidence) playNode(node.nextNode);
    }
});