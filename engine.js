// ==========================================
// 1. BIẾN TOÀN CỤC & DOM ELEMENTS
// ==========================================
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

const sfxPlayer = new Audio(); 
const bgLayer = document.getElementById('background-layer');
const charSprite = document.getElementById('character-sprite');
const charName = document.getElementById('character-name');
const dialogueText = document.getElementById('dialogue-text');
const choiceContainer = document.getElementById('choice-container');
const actionHints = document.getElementById('action-hints');
const ceUI = document.getElementById('ce-ui');

function initEngine() {
    const savedData = localStorage.getItem('storyData');
    if (savedData) storyData = JSON.parse(savedData);
    else storyData = []; 
    playerInventory = []; activeCE = null; renderFlowchart();
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');
    document.querySelectorAll('.view-content').forEach(view => view.classList.remove('active-view'));
    document.getElementById(tabId + '-view').classList.add('active-view');
    if (tabId === 'flowchart') renderFlowchart();
}

function renderFlowchart() {
    const canvas = document.getElementById('canvas-area'); canvas.innerHTML = ''; 
    if (storyData.length === 0) return;
    storyData.forEach(node => {
        const card = document.createElement('div'); card.className = 'flow-node';
        let html = `<div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 5px; margin-bottom: 10px;">
                <h4 style="margin: 0; color: #569cd6;">ID: ${node.id}</h4>
                <button onclick="playFromNode('${node.id}')" style="background: #27ae60; padding: 4px 10px; margin: 0; border-radius: 4px; border: none; color: white; cursor: pointer;">▶ Phát</button>
            </div><p><strong>${node.characterName}:</strong></p>`;
        const shortText = node.dialogueText.length > 40 ? node.dialogueText.substring(0, 40) + '...' : node.dialogueText;
        html += `<p style="font-style: italic; color: #ce9178; margin-bottom: 10px;">"${shortText}"</p>`;
        
        if(node.ceSetup) html += `<p style="font-size:0.8rem; color:#d35400;">⚙️ Setup Đối chất: ${node.ceSetup.testimonies.length} node</p>`;
        if(node.pressNode) html += `<p style="font-size:0.8rem; color:#e74c3c;">Q -> ${node.pressNode}</p>`;

        card.innerHTML = html; canvas.appendChild(card);
    });
}

function playFromNode(nodeId) {
    if (isTyping) { clearTimeout(typeTimeout); isTyping = false; }
    choiceContainer.style.display = 'none'; document.getElementById('inventory-ui').style.display = 'none';
    isWaitingForChoice = false; isWaitingForEvidence = false; activeCE = null; 
    switchTab('player'); playNode(nodeId);
}

function goToVisualEditor() {
    let customId = document.getElementById('edit-node-id').value;
    if (!customId) { alert("Vui lòng nhập ID Node!"); return; }
    localStorage.setItem('editingNodeId', customId); localStorage.setItem('storyData', JSON.stringify(storyData));
    window.location.href = 'visual-editor.html';
}

function addChoiceField() {
    const container = document.getElementById('choices-container');
    const row = document.createElement('div'); row.className = 'choice-input-row';
    row.innerHTML = `<input type="text" class="choice-text" placeholder="Đáp án..."><input type="text" class="choice-target" placeholder="ID Node đích"><button type="button" class="btn-remove-choice" onclick="this.parentElement.remove()">X</button>`;
    container.appendChild(row);
}

// ==========================================
// 3. EDITOR: THÊM DỮ LIỆU MỚI
// ==========================================
function addNewNode() {
    const id = document.getElementById('edit-node-id').value || "node_" + Date.now();
    const charName = document.getElementById('edit-char-name').value;
    const dialogue = document.getElementById('edit-dialogue').value;
    const nextNode = document.getElementById('edit-next-node').value || "end";
    
    if (!charName || !dialogue) { alert("Nhập Tên và Thoại!"); return; }

    const imgFile = document.getElementById('edit-char-img')?.files[0];
    const sfxFile = document.getElementById('edit-sfx')?.files[0]; 
    const stopAudio = document.getElementById('edit-stop-audio')?.checked; 

    let imgUrl = imgFile ? URL.createObjectURL(imgFile) : "";
    let audioConfig = stopAudio ? { action: "stop" } : (sfxFile ? { action: "play", url: URL.createObjectURL(sfxFile) } : { action: "continue" });

    // Thu thập Bằng chứng
    const reqEv = document.getElementById('edit-correct-ev').value;
    const passNode = document.getElementById('edit-ev-pass').value;
    const failNode = document.getElementById('edit-ev-fail').value;
    const evidenceChallenge = (reqEv && passNode) ? { correctId: reqEv, passNode: passNode, failNode: failNode } : null;

    const addEvId = document.getElementById('edit-add-ev-id').value;
    const addEvidence = (addEvId) ? { id: addEvId, name: document.getElementById('edit-add-ev-name').value, desc: document.getElementById('edit-add-ev-desc').value, img: document.getElementById('edit-add-ev-img').value } : null;

    // Thu thập Setup Đối chất (Bao gồm Node Phạt chung)
    const pressNode = document.getElementById('edit-press-node').value;
    const ceSetupStr = document.getElementById('edit-ce-setup').value;
    const ceSetup = ceSetupStr ? { 
        testimonies: ceSetupStr.split(',').map(s=>s.trim()), 
        hintNode: document.getElementById('edit-ce-hint').value, 
        allPressedNode: document.getElementById('edit-ce-all-pressed').value,
        failEvNode: document.getElementById('edit-ce-fail-ev').value // <--- Lưu Node Phạt chung
    } : null;
    
    const ceAddId = document.getElementById('edit-ce-add-new').value;
    const ceAdd = ceAddId ? { newId: ceAddId, afterId: document.getElementById('edit-ce-add-after').value } : null;

    const choices = [];
    document.querySelectorAll('.choice-input-row').forEach(row => {
        const text = row.querySelector('.choice-text').value;
        if (text) choices.push({ text, nextNode: row.querySelector('.choice-target').value || "end" });
    });

    const newNode = { id, characterName: charName, characterSprite: imgUrl, dialogueText: dialogue, audio: audioConfig, addEvidence, evidenceChallenge, choices, nextNode, pressNode, ceSetup, ceAdd };

    if (storyData.length > 0 && !document.getElementById('edit-node-id').value) {
        let lastNode = storyData[storyData.length - 1];
        if (!lastNode.choices || lastNode.choices.length===0) lastNode.nextNode = id;
    }

    storyData.push(newNode);
    localStorage.setItem('storyData', JSON.stringify(storyData)); 

    // Clear inputs
    ['edit-node-id','edit-dialogue','edit-next-node','edit-char-img','edit-add-ev-id','edit-add-ev-name','edit-add-ev-desc','edit-add-ev-img','edit-correct-ev','edit-ev-pass','edit-ev-fail','edit-press-node','edit-ce-setup','edit-ce-hint','edit-ce-all-pressed','edit-ce-fail-ev','edit-ce-add-new','edit-ce-add-after'].forEach(i => { if(document.getElementById(i)) document.getElementById(i).value=''; });
    if(document.getElementById('edit-sfx')) document.getElementById('edit-sfx').value='';
    if(document.getElementById('edit-stop-audio')) document.getElementById('edit-stop-audio').checked=false;
    document.getElementById('choices-container').innerHTML = '';

    if (document.getElementById('player-view').classList.contains('active-view')) playNode(id);
    else renderFlowchart();
}

// ==========================================
// 4. CE NAVIGATION & PLAYER LOGIC
// ==========================================
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
    const node = storyData[nodeIndex];
    currentNodeIndex = nodeIndex;

    // KHỞI TẠO ĐỐI CHẤT
    if (node.ceSetup && node.ceSetup.testimonies.length > 0) {
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

    ceUI.style.display = 'none'; actionHints.style.display = 'none';
    if (ceIdx !== -1) {
        document.getElementById('ce-arrow-left').style.display = ceIdx > 0 ? 'block' : 'none';
        document.getElementById('ce-arrow-right').style.display = 'block';
        renderCEDots(ceIdx, activeCE.testimonies.length);
        ceUI.style.display = 'block'; actionHints.style.display = 'block';
    }

    const addedPopup = document.getElementById('evidence-added-popup'); if (addedPopup) addedPopup.style.display = 'none';
    charName.textContent = node.characterName;
    if (node.characterSprite) { charSprite.src = node.characterSprite; charSprite.style.display = "block"; } else charSprite.style.display = "none";
    const fxLayer = document.getElementById('fx-layer');
    if (node.visualConfig) {
        if (node.visualConfig.bgUrl) { bgLayer.style.backgroundImage = `url('${node.visualConfig.bgUrl}')`; bgLayer.style.backgroundSize = "cover"; }
        if (fxLayer) fxLayer.className = "fx-overlay " + (node.visualConfig.vfx || "");
    } else { if (fxLayer) fxLayer.className = "fx-overlay"; }
    
    if (node.audio) {
        if (node.audio.action === "stop") { sfxPlayer.pause(); sfxPlayer.currentTime = 0; }
        else if (node.audio.action === "play" && node.audio.url) { sfxPlayer.src = node.audio.url; sfxPlayer.play().catch(e=>{}); }
    }

    if (node.addEvidence) {
        const ev = node.addEvidence;
        if (!playerInventory.find(item => item.id === ev.id)) playerInventory.push(ev);
        if (addedPopup) {
            document.getElementById('ev-added-name').textContent = ev.name; document.getElementById('ev-added-desc').textContent = ev.desc;
            document.getElementById('ev-added-img').src = ev.img || ''; addedPopup.style.display = 'flex';
        }
    }
    
    choiceContainer.innerHTML = ''; 
    if (node.choices && node.choices.length > 0 && !node.evidenceChallenge) {
        isWaitingForChoice = true; choiceContainer.style.display = 'none'; 
        node.choices.forEach(choice => {
            const btn = document.createElement('button'); btn.className = 'choice-btn'; btn.textContent = choice.text;
            btn.onclick = (e) => { e.stopPropagation(); choiceContainer.style.display = 'none'; isWaitingForChoice = false; playNode(choice.nextNode); };
            choiceContainer.appendChild(btn);
        });
    } else { isWaitingForChoice = false; }
    
    dialogueText.textContent = ""; isTyping = true; typeWriter(node.dialogueText, 0);
}

function typeWriter(text, charIndex) {
    if (charIndex < text.length) {
        dialogueText.textContent += text.charAt(charIndex); charIndex++;
        typeTimeout = setTimeout(() => typeWriter(text, charIndex), typingSpeed);
    } else {
        isTyping = false; 
        const node = storyData[currentNodeIndex];
        if (node.evidenceChallenge && !node.pressNode) {
            if(!activeCE || activeCE.testimonies.indexOf(node.id) === -1) {
                isWaitingForEvidence = true; renderInventoryUI(); document.getElementById('inventory-ui').style.display = 'flex';
            }
        } else if (node.choices && node.choices.length > 0) choiceContainer.style.display = 'flex';
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

// BÀN PHÍM NAVIGATION (Q, E, ARROWS)
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || storyData.length === 0) return;
    const node = storyData[currentNodeIndex];
    const ceIdx = activeCE ? activeCE.testimonies.indexOf(node.id) : -1;

    if (e.key.toLowerCase() === 'q' && ceIdx !== -1 && !isTyping) {
        if (node.pressNode) { activeCE.pressedSet.add(node.id); playNode(node.pressNode); }
    }
    // LÔ-GIC ĐẬP BẰNG CHỨNG MỚI (PHÍM E)
    else if (e.key.toLowerCase() === 'e' && !isTyping) {
        const ui = document.getElementById('inventory-ui');

        // CHO PHÉP MỞ TÚI ĐỒ Ở BẤT KỲ LỜI KHAI NÀO TRONG PHIÊN ĐỐI CHẤT
        if (ui.style.display !== 'flex' && (node.evidenceChallenge || ceIdx !== -1)) {
            isWaitingForEvidence = true; renderInventoryUI(); ui.style.display = 'flex';
            return;
        }

        // XÁC NHẬN CHỌN ĐỒ
        if (ui.style.display === 'flex') {
            if (!selectedEvidenceId) { alert("Chưa chọn bằng chứng!"); return; }
            ui.style.display = 'none'; isWaitingForEvidence = false;

            // KIỂM TRA ĐÚNG/SAI
            if (node.evidenceChallenge && selectedEvidenceId === node.evidenceChallenge.correctId) {
                // TRÌNH ĐÚNG LỜI KHAI, ĐÚNG BẰNG CHỨNG -> CHỐT ÁN
                activeCE = null; 
                playNode(node.evidenceChallenge.passNode);
            } else {
                // TRÌNH SAI ĐỒ HOẶC SAI LỜI KHAI -> PHẠT
                if (node.evidenceChallenge && node.evidenceChallenge.failNode) {
                    playNode(node.evidenceChallenge.failNode); // Ưu tiên phạt riêng
                } else if (activeCE && activeCE.failEvNode) {
                    playNode(activeCE.failEvNode); // Phạt chung của phiên đối chất
                } else {
                    alert("Bạn vừa trình sai bằng chứng! (Vui lòng thiết lập Node Phạt chung)");
                }
            }
        }
    }
    else if (e.key === 'ArrowLeft') goPrevTestimony();
    else if (e.key === 'ArrowRight') goNextTestimony();
});

document.addEventListener('click', (e) => {
    if (e.target.closest('#editor-panel') || e.target.closest('#tabs-bar') || e.target.closest('#inventory-ui') || e.target.closest('.ce-arrow')) return;
    if ((isWaitingForChoice || isWaitingForEvidence) && !isTyping) return; 

    if (storyData.length === 0) return;
    const node = storyData[currentNodeIndex];
    
    if (isTyping) {
        clearTimeout(typeTimeout); dialogueText.textContent = node.dialogueText; isTyping = false;
        if (node.choices && node.choices.length > 0) choiceContainer.style.display = 'flex';
    } else {
        const ceIdx = activeCE ? activeCE.testimonies.indexOf(node.id) : -1;
        if (ceIdx !== -1) goNextTestimony(); 
        else if (node.nextNode === "end") { charName.textContent = "Hệ thống"; dialogueText.textContent = "--- KẾT THÚC ---"; } 
        else if (!isWaitingForChoice && !isWaitingForEvidence) playNode(node.nextNode);
    }
});

function exportData() {
    if(storyData.length===0) { alert("Trống!"); return; }
    const a = document.createElement('a');
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ scenes: storyData }, null, 2));
    a.download = "story_engine_data.json"; document.body.appendChild(a); a.click(); a.remove();
}
initEngine();