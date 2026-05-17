// ==========================================
// 1. BIẾN TOÀN CỤC & TÀI NGUYÊN
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
let currentHP = 10;
const MAX_HP = 10;

const bgmPlayer = new Audio(); bgmPlayer.loop = true;
const sfxPlayer = new Audio();

function initEngine() {
    const savedData = localStorage.getItem('storyData');
    if (savedData) storyData = JSON.parse(savedData);
    playerInventory = []; activeCE = null; currentHP = 10;
    storyData.forEach(node => { if(node.hpConfig) node.hpConfig.applied = false; });
    renderFlowchart();
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');
    document.querySelectorAll('.view-content').forEach(view => view.classList.remove('active-view'));
    document.getElementById(tabId + '-view').classList.add('active-view');
    if (tabId === 'flowchart') renderFlowchart();
}

// ==========================================
// 2. EDITOR: THÊM DỮ LIỆU MỚI (LƯU 100% CẤU HÌNH)
// ==========================================
function addNewNode() {
    const id = document.getElementById('edit-node-id').value || "node_" + Date.now();
    const charName = document.getElementById('edit-char-name').value;
    const dialogue = document.getElementById('edit-dialogue').value;
    const nextNode = document.getElementById('edit-next-node').value || "end";
    if (!charName || !dialogue) { alert("Nhập Tên và Thoại!"); return; }

    const bgFile = document.getElementById('edit-bg-img')?.files[0];
    const charFile = document.getElementById('edit-char-img')?.files[0];
    const bgVfx = document.getElementById('edit-bg-vfx')?.value || "";
    const charVfx = document.getElementById('edit-char-vfx')?.value || "";
    let visualConfig = { bgUrl: bgFile ? URL.createObjectURL(bgFile) : "", bgVfx: bgVfx, charUrl: charFile ? URL.createObjectURL(charFile) : "", charVfx: charVfx };

    const bgmFile = document.getElementById('edit-bgm')?.files[0];
    const stopAudio = document.getElementById('edit-stop-audio')?.checked;
    let audioConfig = stopAudio ? { action: "stop" } : (bgmFile ? { action: "play", url: URL.createObjectURL(bgmFile) } : { action: "continue" });

    const sfxFile = document.getElementById('edit-sfx')?.files[0];
    let sfxUrl = sfxFile ? URL.createObjectURL(sfxFile) : "";

    const hpConfig = { state: document.getElementById('edit-hp-state').value, amount: parseInt(document.getElementById('edit-hp-amount').value) || 0, applied: false };

    const reqEv = document.getElementById('edit-correct-ev').value;
    const evidenceChallenge = (reqEv) ? { correctId: reqEv, passNode: document.getElementById('edit-ev-pass').value, failNode: document.getElementById('edit-ev-fail').value } : null;

    const addEvId = document.getElementById('edit-add-ev-id').value;
    const addEvidence = (addEvId) ? { id: addEvId, name: document.getElementById('edit-add-ev-name').value, desc: document.getElementById('edit-add-ev-desc').value, img: document.getElementById('edit-add-ev-img').value } : null;

    const pressNode = document.getElementById('edit-press-node').value;
    const ceSetupStr = document.getElementById('edit-ce-setup').value;
    const ceSetup = ceSetupStr ? { testimonies: ceSetupStr.split(',').map(s=>s.trim()), hintNode: document.getElementById('edit-ce-hint').value, allPressedNode: document.getElementById('edit-ce-all-pressed').value, failEvNode: document.getElementById('edit-ce-fail-ev').value } : null;
    const ceAddId = document.getElementById('edit-ce-add-new').value;
    const ceAdd = ceAddId ? { newId: ceAddId, afterId: document.getElementById('edit-ce-add-after').value } : null;

    const choices = [];
    document.querySelectorAll('.choice-input-row').forEach(row => {
        const text = row.querySelector('.choice-text').value;
        if (text) choices.push({ text, nextNode: row.querySelector('.choice-target').value || "end" });
    });

    let uiX = 100 + (storyData.length * 320 % 2000);
    let uiY = 100 + (Math.floor(storyData.length / 6) * 250);

    const newNode = { id, characterName: charName, dialogueText: dialogue, visualConfig, audio: audioConfig, sfxUrl, hpConfig, addEvidence, evidenceChallenge, choices, nextNode, pressNode, ceSetup, ceAdd, uiX, uiY };

    if (storyData.length > 0 && !document.getElementById('edit-node-id').value) {
        let lastNode = storyData[storyData.length - 1];
        if (!lastNode.choices || lastNode.choices.length===0) lastNode.nextNode = id;
    }

    storyData.push(newNode);
    localStorage.setItem('storyData', JSON.stringify(storyData));
    
    // Clear Form
    ['edit-node-id','edit-dialogue','edit-next-node','edit-hp-amount','edit-add-ev-id','edit-add-ev-name','edit-add-ev-desc','edit-add-ev-img','edit-correct-ev','edit-ev-pass','edit-ev-fail','edit-press-node','edit-ce-setup','edit-ce-hint','edit-ce-all-pressed','edit-ce-fail-ev','edit-ce-add-new','edit-ce-add-after'].forEach(i => { if(document.getElementById(i)) document.getElementById(i).value=''; });
    document.getElementById('choices-container').innerHTML = '';
    
    if (document.getElementById('player-view').classList.contains('active-view')) playNode(id);
    else renderFlowchart();
}

// ==========================================
// 3. VISUAL SCRIPTING (KÉO THẢ, NỐI DÂY, PAN CAMERA)
// ==========================================
let draggedNodeId = null, offsetX = 0, offsetY = 0;
let linkingFrom = null; 
let isPanning = false, panStartX = 0, panStartY = 0, scrollL = 0, scrollT = 0;

function renderFlowchart() {
    const layer = document.getElementById('nodes-layer'); layer.innerHTML = '';
    const canvasArea = document.getElementById('canvas-area');
    
    let maxX = 4000, maxY = 4000;
    
    storyData.forEach(node => {
        if(node.uiX > maxX - 500) maxX = node.uiX + 1000;
        if(node.uiY > maxY - 500) maxY = node.uiY + 1000;

        const box = document.createElement('div');
        box.className = 'visual-node'; box.id = `ui-node-${node.id}`;
        box.style.left = (node.uiX || 100) + 'px'; box.style.top = (node.uiY || 100) + 'px';
        box.setAttribute('onmouseup', `finishLink(event, '${node.id}')`);

        const shortText = node.dialogueText.length > 30 ? node.dialogueText.substring(0, 30) + '...' : node.dialogueText;
        
        let html = `
            <div class="visual-node-header" onmousedown="startDrag(event, '${node.id}')">
                <span>${node.id}</span>
            </div>
            <div class="visual-node-body">
                <strong>${node.characterName}</strong>
                <p class="dialogue-preview">"${shortText}"</p>
                <div class="node-tools">
                    <button class="tool-btn btn-play" onclick="playFromNode('${node.id}')">▶ Phát</button>
                    <button class="tool-btn btn-edit" onclick="openEditModal('${node.id}')">✏️ Sửa</button>
                    <button class="tool-btn btn-break" onclick="breakLinks('${node.id}')">✂️ Cắt Dây</button>
                    <button class="tool-btn btn-delete" onclick="deleteNode('${node.id}')">🗑️ Xóa</button>
                </div>`;
        
        if (node.choices && node.choices.length > 0) {
            html += `<hr style="border-color:#555; margin-top:10px;">`;
            node.choices.forEach((c, idx) => {
                html += `<div class="port-container"><span style="font-size:0.8rem;color:#f1c40f">${c.text}</span>
                         <div class="port-out" onmousedown="startLink(event, '${node.id}', 'choice', ${idx})"></div></div>`;
            });
        } else {
            html += `<div class="port-container"><span style="font-size:0.8rem;color:#3498db">Tiếp tục (Tuyến tính)</span>
                     <div class="port-out linear" onmousedown="startLink(event, '${node.id}', 'next')"></div></div>`;
        }
        
        html += `</div>`;
        box.innerHTML = html; layer.appendChild(box);
    });

    canvasArea.style.width = maxX + 'px'; canvasArea.style.height = maxY + 'px';
    drawConnections();
}

// PAN CAMERA 
document.getElementById('canvas-wrapper').addEventListener('mousedown', (e) => {
    if (e.target.id === 'canvas-wrapper' || e.target.id === 'canvas-area' || e.target.tagName === 'svg') {
        isPanning = true; panStartX = e.clientX; panStartY = e.clientY;
        const wrapper = document.getElementById('canvas-wrapper');
        scrollL = wrapper.scrollLeft; scrollT = wrapper.scrollTop;
        wrapper.style.cursor = 'grabbing';
    }
});

// NODE DRAG 
function startDrag(e, nodeId) {
    e.stopPropagation(); draggedNodeId = nodeId;
    const box = document.getElementById(`ui-node-${nodeId}`);
    offsetX = e.clientX - parseInt(box.style.left || 0); offsetY = e.clientY - parseInt(box.style.top || 0);
}

// LINKING 
function startLink(e, srcId, type, choiceIdx = 0) {
    e.stopPropagation(); linkingFrom = { srcId, type, choiceIdx };
    document.getElementById('temp-link-line').style.display = 'block';
}

function finishLink(e, targetId) {
    // [FIX BUGS]: Chỉ chặn sự kiện nếu người dùng đang NỐI DÂY (linkingFrom có dữ liệu)
    if (!linkingFrom) return; 
    
    e.stopPropagation();
    if (linkingFrom.srcId !== targetId) {
        const srcNode = storyData.find(n => n.id === linkingFrom.srcId);
        if (srcNode) {
            if (linkingFrom.type === 'next') srcNode.nextNode = targetId;
            else if (linkingFrom.type === 'choice') srcNode.choices[linkingFrom.choiceIdx].nextNode = targetId;
            localStorage.setItem('storyData', JSON.stringify(storyData));
            renderFlowchart();
        }
    }
    linkingFrom = null; document.getElementById('temp-link-line').style.display = 'none';
}

// CHUỘT DI CHUYỂN CHUNG
window.addEventListener('mousemove', (e) => {
    if (isPanning) {
        const wrapper = document.getElementById('canvas-wrapper');
        wrapper.scrollLeft = scrollL - (e.clientX - panStartX);
        wrapper.scrollTop = scrollT - (e.clientY - panStartY);
    }
    else if (draggedNodeId) {
        const box = document.getElementById(`ui-node-${draggedNodeId}`);
        box.style.left = (e.clientX - offsetX) + 'px'; box.style.top = (e.clientY - offsetY) + 'px';
        drawConnections();
    }
    else if (linkingFrom) {
        const rect = document.getElementById('canvas-area').getBoundingClientRect();
        const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top;
        
        const srcEl = document.getElementById(`ui-node-${linkingFrom.srcId}`);
        if(srcEl) {
            const startX = parseInt(srcEl.style.left) + srcEl.offsetWidth;
            const startY = parseInt(srcEl.style.top) + (linkingFrom.type === 'next' ? srcEl.offsetHeight - 25 : srcEl.offsetHeight - 25 - ((srcEl.querySelectorAll('.port-out').length - 1 - linkingFrom.choiceIdx) * 25));
            const pathData = `M ${startX} ${startY} C ${startX + 150} ${startY}, ${mouseX - 150} ${mouseY}, ${mouseX} ${mouseY}`;
            document.getElementById('temp-link-line').setAttribute("d", pathData);
        }
    }
});

// [FIX BUGS]: NHẢ CHUỘT CHUNG (XÓA SẠCH TRẠNG THÁI KÉO)
window.addEventListener('mouseup', () => {
    // 1. Nhả camera
    if (isPanning) { isPanning = false; document.getElementById('canvas-wrapper').style.cursor = 'grab'; }
    
    // 2. Nhả Node đang kéo
    if (draggedNodeId) {
        const node = storyData.find(n => n.id === draggedNodeId);
        const box = document.getElementById(`ui-node-${draggedNodeId}`);
        if (node && box) { 
            node.uiX = parseInt(box.style.left); 
            node.uiY = parseInt(box.style.top); 
            localStorage.setItem('storyData', JSON.stringify(storyData)); 
        }
        draggedNodeId = null; // Cực kỳ quan trọng: Hủy id đang kéo để giải phóng chuột
    }
    
    // 3. Nhả dây nối (Nếu thả ra ngoài không trúng cổng nào)
    if (linkingFrom) { linkingFrom = null; document.getElementById('temp-link-line').style.display = 'none'; }
});

function drawConnections() {
    const svg = document.getElementById('svg-lines');
    Array.from(svg.children).forEach(child => { if(child.id !== 'temp-link-line') svg.removeChild(child); });

    storyData.forEach(node => {
        const el1 = document.getElementById(`ui-node-${node.id}`);
        if (!el1) return;
        const x1 = parseInt(el1.style.left) + el1.offsetWidth;

        if (node.nextNode && node.nextNode !== 'end') {
            const y1 = parseInt(el1.style.top) + el1.offsetHeight - 25;
            drawPath(svg, x1, y1, node.nextNode, 'node-connection');
        }
        if (node.choices) {
            node.choices.forEach((c, idx) => {
                if (c.nextNode && c.nextNode !== 'end') {
                    const y1 = parseInt(el1.style.top) + el1.offsetHeight - 25 - ((node.choices.length - 1 - idx) * 25);
                    drawPath(svg, x1, y1, c.nextNode, 'node-connection choice');
                }
            });
        }
    });
}

function drawPath(svg, x1, y1, targetId, cssClass) {
    const el2 = document.getElementById(`ui-node-${targetId}`);
    if (!el2) return;
    const x2 = parseInt(el2.style.left); const y2 = parseInt(el2.style.top) + (el2.offsetHeight / 2);
    const offset = Math.abs(x2 - x1) * 0.5;
    const pathData = `M ${x1} ${y1} C ${x1 + offset} ${y1}, ${x2 - offset} ${y2}, ${x2} ${y2}`;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData); path.setAttribute("class", cssClass); svg.appendChild(path);
}

// ==========================================
// 4. CÁC CÔNG CỤ CỦA NODE
// ==========================================
function breakLinks(nodeId) {
    const node = storyData.find(n => n.id === nodeId);
    if (!node) return;
    node.nextNode = "end";
    if (node.choices) node.choices.forEach(c => c.nextNode = "end");
    localStorage.setItem('storyData', JSON.stringify(storyData)); renderFlowchart();
}

function deleteNode(nodeId) {
    if(confirm(`Xóa vĩnh viễn Node: ${nodeId}?`)) {
        storyData = storyData.filter(n => n.id !== nodeId);
        storyData.forEach(n => {
            if(n.nextNode === nodeId) n.nextNode = "end";
            if(n.choices) n.choices.forEach(c => { if(c.nextNode === nodeId) c.nextNode = "end"; });
        });
        localStorage.setItem('storyData', JSON.stringify(storyData)); renderFlowchart();
    }
}

function openEditModal(nodeId) {
    const node = storyData.find(n => n.id === nodeId);
    if (!node) return;
    document.getElementById('modal-node-id').value = node.id;
    document.getElementById('modal-char-name').value = node.characterName || "";
    document.getElementById('modal-dialogue').value = node.dialogueText || "";
    if (node.visualConfig) { document.getElementById('modal-bg-vfx').value = node.visualConfig.bgVfx || ""; document.getElementById('modal-char-vfx').value = node.visualConfig.charVfx || ""; }
    document.getElementById('edit-modal').style.display = 'flex';
}

function closeModal() { document.getElementById('edit-modal').style.display = 'none'; }

function saveModalEdit() {
    const node = storyData.find(n => n.id === document.getElementById('modal-node-id').value);
    if (node) {
        node.characterName = document.getElementById('modal-char-name').value;
        node.dialogueText = document.getElementById('modal-dialogue').value;
        if(!node.visualConfig) node.visualConfig = {};
        node.visualConfig.bgVfx = document.getElementById('modal-bg-vfx').value;
        node.visualConfig.charVfx = document.getElementById('modal-char-vfx').value;
        localStorage.setItem('storyData', JSON.stringify(storyData));
        renderFlowchart(); closeModal();
    }
}

// ==========================================
// 5. PLAYER CORE (GAMEPLAY, CE, HP)
// ==========================================
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

function playFromNode(nodeId) {
    if (isTyping) { clearTimeout(typeTimeout); isTyping = false; }
    document.getElementById('choice-container').style.display = 'none'; document.getElementById('inventory-ui').style.display = 'none';
    isWaitingForChoice = false; isWaitingForEvidence = false; activeCE = null; switchTab('player'); playNode(nodeId);
}

function playNode(nodeId) {
    const nodeIndex = storyData.findIndex(s => s.id === nodeId);
    if (nodeIndex === -1) return;
    const node = storyData[nodeIndex]; currentNodeIndex = nodeIndex;

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

    const ceUI = document.getElementById('ce-ui'); const actionHints = document.getElementById('action-hints');
    ceUI.style.display = 'none'; actionHints.style.display = 'none';
    if (ceIdx !== -1) {
        document.getElementById('ce-arrow-left').style.display = ceIdx > 0 ? 'block' : 'none';
        document.getElementById('ce-arrow-right').style.display = 'block';
        renderCEDots(ceIdx, activeCE.testimonies.length);
        ceUI.style.display = 'block'; actionHints.style.display = 'block';
    }

    const bgLayer = document.getElementById('background-layer');
    const charSprite = document.getElementById('character-sprite');
    const config = node.visualConfig;
    if (config && config.bgUrl) bgLayer.style.backgroundImage = `url('${config.bgUrl}')`;
    bgLayer.className = (config && config.bgVfx) ? config.bgVfx : "";

    const charSrc = node.characterSprite || (config ? config.charUrl : "");
    if (charSrc) { charSprite.src = charSrc; charSprite.style.display = "block"; } else charSprite.style.display = "none";
    charSprite.className = (config && config.charVfx) ? config.charVfx : "";

    if (node.audio) {
        if (node.audio.action === "stop") { bgmPlayer.pause(); bgmPlayer.currentTime = 0; }
        else if (node.audio.action === "play" && node.audio.url) { bgmPlayer.src = node.audio.url; bgmPlayer.play().catch(e=>{}); }
    }
    if (node.sfxUrl) { sfxPlayer.src = node.sfxUrl; sfxPlayer.currentTime = 0; sfxPlayer.play().catch(e=>{}); }

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

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || storyData.length === 0) return;
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
    if (e.target.closest('#editor-panel') || e.target.closest('#tabs-bar') || e.target.closest('#inventory-ui') || e.target.closest('.ce-arrow') || e.target.closest('.visual-node') || e.target.closest('.modal-content')) return;
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

function exportData() {
    if(storyData.length===0) return;
    const a = document.createElement('a');
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ scenes: storyData }, null, 2));
    a.download = "story_engine_data.json"; document.body.appendChild(a); a.click(); a.remove();
}

initEngine();