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
const previewAudioPlayer = new Audio();
let currentBgmUrl = ""; // [FIX BUG]: Biến theo dõi chính xác bài hát đang phát

const EDITOR_DRAFT_KEY = 'editorDraft';
const STORY_CACHE_KEY = 'storyData';
const PENDING_VISUAL_UPDATE_KEY = 'pendingVisualUpdate';
const STORY_DB_NAME = 'immersiveStoryEngine';
const STORY_DB_STORE = 'sync';

function normalizeStoryData(rawData) {
    const scenes = Array.isArray(rawData) ? rawData : ((rawData && Array.isArray(rawData.scenes)) ? rawData.scenes : []);
    return scenes.map((node) => {
        const visualConfig = { ...(node.visualConfig || {}) };
        if (!visualConfig.bgUrl && node.background) visualConfig.bgUrl = node.background;
        if (!visualConfig.charUrl && node.characterSprite) visualConfig.charUrl = node.characterSprite;

        let audioConfig = node.audio || { action: 'continue' };
        if (audioConfig && !audioConfig.action) {
            if (audioConfig.bgm && audioConfig.bgm !== 'continue' && audioConfig.bgm !== 'none') {
                audioConfig = { action: 'play', url: audioConfig.bgm };
            } else if (audioConfig.bgm === 'none') {
                audioConfig = { action: 'stop' };
            } else {
                audioConfig = { action: 'continue' };
            }
        }
        const sfxUrl = node.sfxUrl || ((node.audio && node.audio.sfx && node.audio.sfx !== 'none') ? node.audio.sfx : '');
        return { ...node, visualConfig, characterSprite: node.characterSprite || visualConfig.charUrl || '', audio: audioConfig, sfxUrl };
    });
}

function buildStoryDocument(data) {
    return {
        scenes: data.map((node) => ({
            ...node,
            background: (node.visualConfig && node.visualConfig.bgUrl) ? node.visualConfig.bgUrl : (node.background || ''),
            characterSprite: node.characterSprite || ((node.visualConfig && node.visualConfig.charUrl) ? node.visualConfig.charUrl : '')
        }))
    };
}

function setStoryDataCache(data) {
    try { localStorage.setItem(STORY_CACHE_KEY, JSON.stringify(data)); } 
    catch (error) { try { localStorage.removeItem(STORY_CACHE_KEY); } catch (e) {} }
}

function openStorySyncDb() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error('IndexedDB khong kha dung.')); return; }
        const request = indexedDB.open(STORY_DB_NAME, 1);
        request.onupgradeneeded = () => { request.result.createObjectStore(STORY_DB_STORE); };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getStorySyncValue(key) {
    const db = await openStorySyncDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORY_DB_STORE, 'readonly');
        const request = transaction.objectStore(STORY_DB_STORE).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

async function applyPendingVisualUpdate() {
    try {
        let pendingUpdate = JSON.parse(localStorage.getItem(PENDING_VISUAL_UPDATE_KEY) || 'null');
        if (!pendingUpdate) pendingUpdate = await getStorySyncValue(PENDING_VISUAL_UPDATE_KEY);
        if (!pendingUpdate || !pendingUpdate.nodeId || !pendingUpdate.visualConfig) return;

        const targetNode = storyData.find((node) => node.id === pendingUpdate.nodeId);
        if (!targetNode) return;

        targetNode.visualConfig = { ...(targetNode.visualConfig || {}), ...pendingUpdate.visualConfig };
        targetNode.background = pendingUpdate.background || targetNode.background || '';
        targetNode.characterSprite = pendingUpdate.characterSprite || targetNode.characterSprite || '';
        localStorage.removeItem(PENDING_VISUAL_UPDATE_KEY);
    } catch (error) {}
}

// [FIX UPLOAD]: Hàm đọc file và đẩy lên Server thay vì lưu Base64 khổng lồ
function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        if (!file) { resolve(""); return; }
        const reader = new FileReader();
        reader.onload = async () => {
            const base64Data = reader.result || "";
            // Đẩy lên Server nội bộ để lấy đường dẫn tương đối
            if (window.location.protocol !== 'file:') {
                try {
                    const response = await fetch('/api/upload-media', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: file.name, data: base64Data })
                    });
                    const result = await response.json();
                    if (response.ok && result.url) { resolve(result.url); return; }
                } catch (error) { console.warn('Lỗi đẩy file lên server, dùng Base64:', error); }
            }
            resolve(base64Data);
        };
        reader.onerror = () => reject(new Error("Khong doc duoc file: " + file.name));
        reader.readAsDataURL(file);
    });
}

async function initEngine() {
    try {
        const response = await fetch('story_data.json', { cache: 'no-store' });
        if (response.ok) {
            const fileData = await response.json();
            storyData = normalizeStoryData(fileData);
            setStoryDataCache(storyData);
        }
    } catch (error) { console.warn('Khong the nap story_data.json, thu fallback localStorage:', error); }

    if (storyData.length === 0) {
        const savedData = localStorage.getItem(STORY_CACHE_KEY);
        if (savedData) {
            try { storyData = normalizeStoryData(JSON.parse(savedData)); } 
            catch (error) { localStorage.removeItem(STORY_CACHE_KEY); storyData = []; }
        }
    }

    playerInventory = []; activeCE = null; currentHP = 10; currentBgmUrl = "";
    await applyPendingVisualUpdate();
    storyData.forEach(node => { if(node.hpConfig) node.hpConfig.applied = false; });
    renderFlowchart();
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeButton = (typeof event !== 'undefined' && event.currentTarget) ? event.currentTarget : document.querySelector(`.tab-btn[onclick="switchTab('${tabId}')"]`);
    if (activeButton) activeButton.classList.add('active');
    document.querySelectorAll('.view-content').forEach(view => view.classList.remove('active-view'));
    document.getElementById(tabId + '-view').classList.add('active-view');
    if (tabId === 'flowchart') renderFlowchart();
}

function collectEditorDraft() {
    const getValue = (id) => { const element = document.getElementById(id); return element ? element.value : ''; };
    const previousDraft = loadEditorDraftFromStorage() || {};
    const draftVisualConfig = previousDraft.visualConfig || {};
    return {
        id: getValue('edit-node-id'), characterName: getValue('edit-char-name'), dialogueText: getValue('edit-dialogue'), nextNode: getValue('edit-next-node'), bgVfx: getValue('edit-bg-vfx'), charVfx: getValue('edit-char-vfx'),
        visualConfig: { ...draftVisualConfig, bgVfx: getValue('edit-bg-vfx') || draftVisualConfig.bgVfx || '', charVfx: getValue('edit-char-vfx') || draftVisualConfig.charVfx || '' }
    };
}

function saveEditorDraftToStorage() { localStorage.setItem(EDITOR_DRAFT_KEY, JSON.stringify(collectEditorDraft())); }
function loadEditorDraftFromStorage() { try { return JSON.parse(localStorage.getItem(EDITOR_DRAFT_KEY) || 'null'); } catch (error) { return null; } }

function hydrateEditorFormFromDraft() {
    const draft = loadEditorDraftFromStorage();
    if (!draft) return;
    const setValue = (id, value) => { const element = document.getElementById(id); if (element && typeof value === 'string') element.value = value; };
    setValue('edit-node-id', draft.id || ''); setValue('edit-char-name', draft.characterName || ''); setValue('edit-dialogue', draft.dialogueText || ''); setValue('edit-next-node', draft.nextNode || '');
    setValue('edit-bg-vfx', (draft.visualConfig && draft.visualConfig.bgVfx) || draft.bgVfx || ''); setValue('edit-char-vfx', (draft.visualConfig && draft.visualConfig.charVfx) || draft.charVfx || '');
}

function getDraftVisualConfig() { const editorDraft = loadEditorDraftFromStorage() || {}; return editorDraft.visualConfig || {}; }

function getSelectedMediaPreview() {
    const bgFile = document.getElementById('edit-bg-img')?.files[0]; const charFile = document.getElementById('edit-char-img')?.files[0];
    const bgmFile = document.getElementById('edit-bgm')?.files[0]; const sfxFile = document.getElementById('edit-sfx')?.files[0];
    const draftVisualConfig = getDraftVisualConfig();
    return {
        bgUrl: bgFile ? URL.createObjectURL(bgFile) : (draftVisualConfig.bgUrl || ""), charUrl: charFile ? URL.createObjectURL(charFile) : (draftVisualConfig.charUrl || ""),
        bgVfx: document.getElementById('edit-bg-vfx')?.value || draftVisualConfig.bgVfx || "", charVfx: document.getElementById('edit-char-vfx')?.value || draftVisualConfig.charVfx || "",
        audioUrl: bgmFile ? URL.createObjectURL(bgmFile) : "", sfxUrl: sfxFile ? URL.createObjectURL(sfxFile) : "", stopAudio: document.getElementById('edit-stop-audio')?.checked || false
    };
}

function previewSelectedSceneMedia() {
    const preview = getSelectedMediaPreview();
    const bgLayer = document.getElementById('background-layer'); const charSprite = document.getElementById('character-sprite');
    bgLayer.style.backgroundImage = preview.bgUrl ? `url('${preview.bgUrl}')` : ''; bgLayer.className = preview.bgVfx;
    if (preview.charUrl) { charSprite.src = preview.charUrl; charSprite.style.display = "block"; } else { charSprite.removeAttribute('src'); charSprite.style.display = "none"; }
    charSprite.className = preview.charVfx;

    previewAudioPlayer.pause(); previewAudioPlayer.currentTime = 0;
    if (preview.stopAudio) { bgmPlayer.pause(); bgmPlayer.currentTime = 0; } 
    else if (preview.audioUrl) { previewAudioPlayer.src = preview.audioUrl; previewAudioPlayer.loop = true; previewAudioPlayer.play().catch(e=>{}); } 
    else if (preview.sfxUrl) { previewAudioPlayer.src = preview.sfxUrl; previewAudioPlayer.loop = false; previewAudioPlayer.play().catch(e=>{}); }
}

function bindSceneMediaPreview() {
    ['edit-bg-img', 'edit-char-img', 'edit-bg-vfx', 'edit-char-vfx', 'edit-bgm', 'edit-sfx', 'edit-stop-audio'].forEach((id) => {
        const element = document.getElementById(id); if (element) element.addEventListener('change', previewSelectedSceneMedia);
    });
}

// ==========================================
// 2. EDITOR: THÊM DỮ LIỆU MỚI (LƯU 100% CẤU HÌNH)
// ==========================================
async function addNewNode() {
    const id = document.getElementById('edit-node-id').value || "node_" + Date.now();
    const charName = document.getElementById('edit-char-name').value;
    const dialogue = document.getElementById('edit-dialogue').value;
    const nextNode = document.getElementById('edit-next-node').value || "end";
    if (!charName || !dialogue) { alert("Nhập Tên và Thoại!"); return; }

    const bgFile = document.getElementById('edit-bg-img')?.files[0];
    const charFile = document.getElementById('edit-char-img')?.files[0];
    const bgVfx = document.getElementById('edit-bg-vfx')?.value || "";
    const charVfx = document.getElementById('edit-char-vfx')?.value || "";
    const editorDraft = loadEditorDraftFromStorage() || {};
    const draftVisualConfig = editorDraft.visualConfig || {};
    
    const bgUrl = bgFile ? await readFileAsDataUrl(bgFile) : (draftVisualConfig.bgUrl || "");
    const charUrl = charFile ? await readFileAsDataUrl(charFile) : (draftVisualConfig.charUrl || "");
    let visualConfig = {
        bgUrl, bgVfx: bgVfx || draftVisualConfig.bgVfx || "", bgPrompt: draftVisualConfig.bgPrompt || "", bgSource: bgFile ? "upload" : (draftVisualConfig.bgSource || ""),
        charUrl, charVfx: charVfx || draftVisualConfig.charVfx || "", charPrompt: draftVisualConfig.charPrompt || "", charSource: charFile ? "upload" : (draftVisualConfig.charSource || "")
    };

    const bgmFile = document.getElementById('edit-bgm')?.files[0];
    const stopAudio = document.getElementById('edit-stop-audio')?.checked;
    const bgmUrl = bgmFile ? await readFileAsDataUrl(bgmFile) : "";
    let audioConfig = stopAudio ? { action: "stop" } : (bgmUrl ? { action: "play", url: bgmUrl } : { action: "continue" });

    const sfxFile = document.getElementById('edit-sfx')?.files[0];
    let sfxUrl = sfxFile ? await readFileAsDataUrl(sfxFile) : "";

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

    const newNode = {
        id, characterName: charName, dialogueText: dialogue, characterSprite: visualConfig.charUrl || "", background: visualConfig.bgUrl || "",
        visualConfig, audio: audioConfig, sfxUrl, hpConfig, addEvidence, evidenceChallenge, choices, nextNode, pressNode, ceSetup, ceAdd, uiX, uiY
    };

    const existingNodeIndex = storyData.findIndex(node => node.id === id);
    if (existingNodeIndex !== -1) {
        storyData[existingNodeIndex] = { ...storyData[existingNodeIndex], ...newNode, visualConfig: { ...(storyData[existingNodeIndex].visualConfig || {}), ...visualConfig } };
    } else {
        if (storyData.length > 0 && !document.getElementById('edit-node-id').value) {
            let lastNode = storyData[storyData.length - 1];
            if (!lastNode.choices || lastNode.choices.length===0) lastNode.nextNode = id;
        }
        storyData.push(newNode);
    }

    setStoryDataCache(storyData);
    localStorage.removeItem(EDITOR_DRAFT_KEY);
    
    // [FIX LỖI CŨNG NHƯ FORM CLEAR]: Xóa sạch Text, File Audio và Hình ảnh
    ['edit-node-id','edit-dialogue','edit-next-node','edit-hp-amount','edit-add-ev-id','edit-add-ev-name','edit-add-ev-desc','edit-add-ev-img','edit-correct-ev','edit-ev-pass','edit-ev-fail','edit-press-node','edit-ce-setup','edit-ce-hint','edit-ce-all-pressed','edit-ce-fail-ev','edit-ce-add-new','edit-ce-add-after',
    'edit-bg-img', 'edit-char-img', 'edit-bgm', 'edit-sfx', 'edit-bg-vfx', 'edit-char-vfx'].forEach(i => { if(document.getElementById(i)) document.getElementById(i).value=''; });
    
    if(document.getElementById('edit-hp-state')) document.getElementById('edit-hp-state').value='hidden';
    if(document.getElementById('edit-stop-audio')) document.getElementById('edit-stop-audio').checked=false;
    document.getElementById('choices-container').innerHTML = '';
    
    previewAudioPlayer.pause(); previewAudioPlayer.currentTime = 0;
    playFromNode(id);
}

// ==========================================
// 3. VISUAL SCRIPTING (KÉO THẢ, NỐI DÂY)
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
            <div class="visual-node-header" onmousedown="startDrag(event, '${node.id}')"><span>${node.id}</span></div>
            <div class="visual-node-body">
                <strong>${node.characterName}</strong><p class="dialogue-preview">"${shortText}"</p>
                <div class="node-tools">
                    <button class="tool-btn btn-play" onclick="playFromNode('${node.id}')">▶ Phát</button>
                    <button class="tool-btn btn-edit" onclick="openEditModal('${node.id}')">✏️ Sửa</button>
                    <button class="tool-btn btn-break" onclick="breakLinks('${node.id}')">✂️ Cắt Dây</button>
                    <button class="tool-btn btn-delete" onclick="deleteNode('${node.id}')">🗑️ Xóa</button>
                </div>`;
        if (node.choices && node.choices.length > 0) {
            html += `<hr style="border-color:#555; margin-top:10px;">`;
            node.choices.forEach((c, idx) => {
                html += `<div class="port-container"><span style="font-size:0.8rem;color:#f1c40f">${c.text}</span><div class="port-out" onmousedown="startLink(event, '${node.id}', 'choice', ${idx})"></div></div>`;
            });
        } else {
            html += `<div class="port-container"><span style="font-size:0.8rem;color:#3498db">Tiếp tục (Tuyến tính)</span><div class="port-out linear" onmousedown="startLink(event, '${node.id}', 'next')"></div></div>`;
        }
        html += `</div>`; box.innerHTML = html; layer.appendChild(box);
    });
    canvasArea.style.width = maxX + 'px'; canvasArea.style.height = maxY + 'px'; drawConnections();
}

document.getElementById('canvas-wrapper').addEventListener('mousedown', (e) => {
    if (e.target.id === 'canvas-wrapper' || e.target.id === 'canvas-area' || e.target.tagName === 'svg') {
        isPanning = true; panStartX = e.clientX; panStartY = e.clientY;
        const wrapper = document.getElementById('canvas-wrapper'); scrollL = wrapper.scrollLeft; scrollT = wrapper.scrollTop; wrapper.style.cursor = 'grabbing';
    }
});

function startDrag(e, nodeId) {
    e.stopPropagation(); draggedNodeId = nodeId;
    const box = document.getElementById(`ui-node-${nodeId}`);
    offsetX = e.clientX - parseInt(box.style.left || 0); offsetY = e.clientY - parseInt(box.style.top || 0);
}
function startLink(e, srcId, type, choiceIdx = 0) {
    e.stopPropagation(); linkingFrom = { srcId, type, choiceIdx }; document.getElementById('temp-link-line').style.display = 'block';
}
function finishLink(e, targetId) {
    if (!linkingFrom) return; 
    e.stopPropagation();
    if (linkingFrom.srcId !== targetId) {
        const srcNode = storyData.find(n => n.id === linkingFrom.srcId);
        if (srcNode) {
            if (linkingFrom.type === 'next') srcNode.nextNode = targetId; else if (linkingFrom.type === 'choice') srcNode.choices[linkingFrom.choiceIdx].nextNode = targetId;
            setStoryDataCache(storyData); renderFlowchart();
        }
    }
    linkingFrom = null; document.getElementById('temp-link-line').style.display = 'none';
}

window.addEventListener('mousemove', (e) => {
    if (isPanning) {
        const wrapper = document.getElementById('canvas-wrapper'); wrapper.scrollLeft = scrollL - (e.clientX - panStartX); wrapper.scrollTop = scrollT - (e.clientY - panStartY);
    } else if (draggedNodeId) {
        const box = document.getElementById(`ui-node-${draggedNodeId}`); box.style.left = (e.clientX - offsetX) + 'px'; box.style.top = (e.clientY - offsetY) + 'px'; drawConnections();
    } else if (linkingFrom) {
        const rect = document.getElementById('canvas-area').getBoundingClientRect(); const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top;
        const srcEl = document.getElementById(`ui-node-${linkingFrom.srcId}`);
        if(srcEl) {
            const startX = parseInt(srcEl.style.left) + srcEl.offsetWidth;
            const startY = parseInt(srcEl.style.top) + (linkingFrom.type === 'next' ? srcEl.offsetHeight - 25 : srcEl.offsetHeight - 25 - ((srcEl.querySelectorAll('.port-out').length - 1 - linkingFrom.choiceIdx) * 25));
            const pathData = `M ${startX} ${startY} C ${startX + 150} ${startY}, ${mouseX - 150} ${mouseY}, ${mouseX} ${mouseY}`;
            document.getElementById('temp-link-line').setAttribute("d", pathData);
        }
    }
});

window.addEventListener('mouseup', () => {
    if (isPanning) { isPanning = false; document.getElementById('canvas-wrapper').style.cursor = 'grab'; }
    if (draggedNodeId) {
        const node = storyData.find(n => n.id === draggedNodeId); const box = document.getElementById(`ui-node-${draggedNodeId}`);
        if (node && box) { node.uiX = parseInt(box.style.left); node.uiY = parseInt(box.style.top); setStoryDataCache(storyData); }
        draggedNodeId = null; 
    }
    if (linkingFrom) { linkingFrom = null; document.getElementById('temp-link-line').style.display = 'none'; }
});

function drawConnections() {
    const svg = document.getElementById('svg-lines');
    Array.from(svg.children).forEach(child => { if(child.id !== 'temp-link-line') svg.removeChild(child); });
    storyData.forEach(node => {
        const el1 = document.getElementById(`ui-node-${node.id}`); if (!el1) return;
        const x1 = parseInt(el1.style.left) + el1.offsetWidth;
        if (node.nextNode && node.nextNode !== 'end') {
            const y1 = parseInt(el1.style.top) + el1.offsetHeight - 25; drawPath(svg, x1, y1, node.nextNode, 'node-connection');
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
    const el2 = document.getElementById(`ui-node-${targetId}`); if (!el2) return;
    const x2 = parseInt(el2.style.left); const y2 = parseInt(el2.style.top) + (el2.offsetHeight / 2);
    const offset = Math.abs(x2 - x1) * 0.5;
    const pathData = `M ${x1} ${y1} C ${x1 + offset} ${y1}, ${x2 - offset} ${y2}, ${x2} ${y2}`;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData); path.setAttribute("class", cssClass); svg.appendChild(path);
}

function breakLinks(nodeId) { const node = storyData.find(n => n.id === nodeId); if (!node) return; node.nextNode = "end"; if (node.choices) node.choices.forEach(c => c.nextNode = "end"); setStoryDataCache(storyData); renderFlowchart(); }
function deleteNode(nodeId) { if(confirm(`Xóa vĩnh viễn Node: ${nodeId}?`)) { storyData = storyData.filter(n => n.id !== nodeId); storyData.forEach(n => { if(n.nextNode === nodeId) n.nextNode = "end"; if(n.choices) n.choices.forEach(c => { if(c.nextNode === nodeId) c.nextNode = "end"; }); }); setStoryDataCache(storyData); renderFlowchart(); } }
function openEditModal(nodeId) { const node = storyData.find(n => n.id === nodeId); if (!node) return; document.getElementById('modal-node-id').value = node.id; document.getElementById('modal-char-name').value = node.characterName || ""; document.getElementById('modal-dialogue').value = node.dialogueText || ""; if (node.visualConfig) { document.getElementById('modal-bg-vfx').value = node.visualConfig.bgVfx || ""; document.getElementById('modal-char-vfx').value = node.visualConfig.charVfx || ""; } document.getElementById('edit-modal').style.display = 'flex'; }
function closeModal() { document.getElementById('edit-modal').style.display = 'none'; }
function saveModalEdit() { const node = storyData.find(n => n.id === document.getElementById('modal-node-id').value); if (node) { node.characterName = document.getElementById('modal-char-name').value; node.dialogueText = document.getElementById('modal-dialogue').value; if(!node.visualConfig) node.visualConfig = {}; node.visualConfig.bgVfx = document.getElementById('modal-bg-vfx').value; node.visualConfig.charVfx = document.getElementById('modal-char-vfx').value; setStoryDataCache(storyData); renderFlowchart(); closeModal(); } }

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

    const bgLayer = document.getElementById('background-layer');
    const charSprite = document.getElementById('character-sprite');
    const config = node.visualConfig;
    bgLayer.style.backgroundImage = (config && config.bgUrl) ? `url('${config.bgUrl}')` : '';
    bgLayer.className = (config && config.bgVfx) ? config.bgVfx : "";

    const charSrc = node.characterSprite || (config ? config.charUrl : "");
    if (charSrc) { charSprite.src = charSrc; charSprite.style.display = "block"; } else charSprite.style.display = "none";
    charSprite.className = (config && config.charVfx) ? config.charVfx : "";

    // [FIX LỖI AUDIO: BẢO VỆ NHẠC BẰNG currentBgmUrl]
    if (node.audio) {
        if (node.audio.action === "stop") { 
            bgmPlayer.pause(); 
            bgmPlayer.currentTime = 0; 
            currentBgmUrl = ""; // Xoá dấu vết để chắc chắn load lại nếu cảnh sau lại dùng bài này
        }
        else if (node.audio.action === "play" && node.audio.url) { 
            if (currentBgmUrl !== node.audio.url) {
                currentBgmUrl = node.audio.url;
                bgmPlayer.src = node.audio.url;
                bgmPlayer.load();
                bgmPlayer.play().catch(e=>{}); 
            } else {
                // Nếu cùng 1 bài nhạc mà đang bị pause (do bị stop trước đó), phát tiếp
                if (bgmPlayer.paused) bgmPlayer.play().catch(e=>{});
            }
        }
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
    saveEditorDraftToStorage();
    localStorage.setItem('editingNodeId', customId); setStoryDataCache(storyData);
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
    a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(buildStoryDocument(storyData), null, 2));
    a.download = "story_data.json"; document.body.appendChild(a); a.click(); a.remove();
}

async function saveStoryDocumentToProject(documentData) {
    if (window.location.protocol === 'file:') return false;
    const response = await fetch('/api/save-story', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(documentData) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Khong ghi duoc story_data.json');
    return true;
}

async function saveCurrentStoryJson() {
    if (storyData.length === 0) { alert("Chua co kich ban de luu."); return; }
    const documentData = buildStoryDocument(storyData);
    try {
        const savedToProject = await saveStoryDocumentToProject(documentData);
        if (savedToProject) { setStoryDataCache(storyData); alert("Da luu kich ban hien tai vao story_data.json."); return; }
    } catch (error) { console.warn('Khong luu truc tiep duoc story_data.json:', error); }

    const now = new Date();
    const timestamp = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0'), String(now.getHours()).padStart(2, '0'), String(now.getMinutes()).padStart(2, '0'), String(now.getSeconds()).padStart(2, '0')].join('');
    const a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(documentData, null, 2)); a.download = `story_data_${timestamp}.json`; document.body.appendChild(a); a.click(); a.remove();
}

// --- 1. HÀM HỖ TRỢ: Đẩy Base64 cũ lên Server ---
async function uploadBase64ToServer(base64String, prefixName) {
    if (!base64String || !base64String.startsWith('data:')) return base64String;
    if (window.location.protocol === 'file:') return base64String; // Không chạy trên Server thì bỏ qua

    try {
        // Tự động nhận diện định dạng file (png, jpg, mp3...)
        const mime = base64String.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/);
        let ext = ".png";
        if (mime && mime.length > 1) {
            if (mime[1].includes("audio") || mime[1].includes("mpeg")) ext = ".mp3";
            else if (mime[1].includes("wav")) ext = ".wav";
            else if (mime[1].includes("jpeg")) ext = ".jpg";
        }
        
        // Gửi lên API upload-media
        const response = await fetch('/api/upload-media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: prefixName + ext, data: base64String })
        });
        
        const result = await response.json();
        if (response.ok && result.url) return result.url; // Trả về link ngắn
    } catch (error) {
        console.warn("Lỗi khi bóc tách file: ", error);
    }
    return base64String;
}

// --- 2. HÀM IMPORT ĐƯỢC NÂNG CẤP (Bóc tách dữ liệu) ---
function importStoryJson(input) {
    const file = input.files && input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const importedData = JSON.parse(reader.result);
            let parsedScenes = normalizeStoryData(importedData);

            // Kiểm tra xem file có chứa Base64 cũ không
            const hasHeavyData = JSON.stringify(parsedScenes).includes('data:image') || JSON.stringify(parsedScenes).includes('data:audio');

            if (hasHeavyData) {
                document.getElementById('dialogue-text').textContent = "Đang chuyển đổi và bóc tách dữ liệu từ bản cũ. Quá trình này có thể mất vài chục giây...";
                console.log("Phát hiện dữ liệu Base64 cũ. Bắt đầu quá trình Migration...");
                
                // Duyệt qua toàn bộ Node để bóc tách Media
                for (let i = 0; i < parsedScenes.length; i++) {
                    const node = parsedScenes[i];
                    
                    if (node.visualConfig && node.visualConfig.bgUrl && node.visualConfig.bgUrl.startsWith('data:')) {
                        node.visualConfig.bgUrl = await uploadBase64ToServer(node.visualConfig.bgUrl, `old_bg_${node.id}`);
                        node.background = node.visualConfig.bgUrl;
                    }
                    if (node.visualConfig && node.visualConfig.charUrl && node.visualConfig.charUrl.startsWith('data:')) {
                        node.visualConfig.charUrl = await uploadBase64ToServer(node.visualConfig.charUrl, `old_char_${node.id}`);
                        node.characterSprite = node.visualConfig.charUrl;
                    }
                    if (node.audio && node.audio.url && node.audio.url.startsWith('data:')) {
                        node.audio.url = await uploadBase64ToServer(node.audio.url, `old_bgm_${node.id}`);
                    }
                    if (node.sfxUrl && node.sfxUrl.startsWith('data:')) {
                        node.sfxUrl = await uploadBase64ToServer(node.sfxUrl, `old_sfx_${node.id}`);
                    }
                    if (node.addEvidence && node.addEvidence.img && node.addEvidence.img.startsWith('data:')) {
                        node.addEvidence.img = await uploadBase64ToServer(node.addEvidence.img, `old_ev_${node.id}`);
                    }
                }
                alert("Nâng cấp cấu trúc file thành công! File kịch bản của bạn giờ đã siêu nhẹ.");
            }

            // Lưu dữ liệu đã làm sạch vào hệ thống
            storyData = parsedScenes;
            setStoryDataCache(storyData); 
            localStorage.removeItem(EDITOR_DRAFT_KEY);
            playerInventory = []; 
            activeCE = null; 
            currentHP = 10;
            
            renderFlowchart();
            if (storyData.length > 0) playFromNode(storyData[0].id);
            
            if (!hasHeavyData) alert("Đã tải kịch bản cũ.");

        } catch (error) { 
            console.error(error);
            alert("File JSON không hợp lệ hoặc quá trình xử lý bị lỗi."); 
        } finally { 
            input.value = ""; 
        }
    };
    
    reader.onerror = () => { 
        alert("Không đọc được file JSON."); 
        input.value = ""; 
    };
    reader.readAsText(file);
}

initEngine().then(() => {
    hydrateEditorFormFromDraft(); bindSceneMediaPreview();
});