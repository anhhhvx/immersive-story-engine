// ==========================================
// 1. BIẾN TOÀN CỤC & DOM ELEMENTS
// ==========================================
let storyData = [];
let currentNodeIndex = 0;
let isTyping = false;
let typingSpeed = 30; 
let typeTimeout;
let isWaitingForChoice = false; 

// Trình phát âm thanh
const sfxPlayer = new Audio(); 

// Lấy các DOM Elements của màn hình Player
const bgLayer = document.getElementById('background-layer');
const charSprite = document.getElementById('character-sprite');
const charName = document.getElementById('character-name');
const dialogueText = document.getElementById('dialogue-text');
const choiceContainer = document.getElementById('choice-container');

// Khởi tạo Engine
function initEngine() {
    storyData = []; 
    // Nếu có data test, bạn có thể gán vào đây để test trực tiếp
    renderFlowchart();
}

// ==========================================
// 2. HỆ THỐNG TABS & GIAO DIỆN SƠ ĐỒ
// ==========================================
function switchTab(tabId) {
    // Đổi màu nút Tab
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.currentTarget.classList.add('active');

    // Đổi giao diện hiển thị
    document.querySelectorAll('.view-content').forEach(view => view.classList.remove('active-view'));
    document.getElementById(tabId + '-view').classList.add('active-view');

    // Nếu chuyển sang tab Flowchart, gọi hàm vẽ sơ đồ
    if (tabId === 'flowchart') {
        renderFlowchart();
    }
}

function renderFlowchart() {
    const canvas = document.getElementById('canvas-area');
    canvas.innerHTML = ''; 

    if (storyData.length === 0) {
        canvas.innerHTML = '<p style="color:#888;">Chưa có dữ liệu kịch bản. Hãy tạo Node đầu tiên ở cột bên trái.</p>';
        return;
    }

    storyData.forEach(node => {
        const card = document.createElement('div');
        card.className = 'flow-node';

        let html = `<h4>ID: ${node.id}</h4>`;
        html += `<p><strong>${node.characterName}:</strong></p>`;
        
        const shortText = node.dialogueText.length > 40 ? node.dialogueText.substring(0, 40) + '...' : node.dialogueText;
        html += `<p class="dialogue-preview">"${shortText}"</p>`;

        if (node.choices && node.choices.length > 0) {
            html += `<p style="font-size:0.8rem; color:#f39c12; margin-bottom:5px;">Rẽ nhánh (Branching):</p>`;
            node.choices.forEach(c => {
                html += `<div class="flow-choice">
                            ${c.text} <span>👉 ${c.nextNode}</span>
                         </div>`;
            });
        } else {
            html += `<div class="flow-choice" style="border-left-color: #3498db;">
                        Tuyến tính <span>👉 ${node.nextNode}</span>
                     </div>`;
        }

        card.innerHTML = html;
        canvas.appendChild(card);
    });
}

// ==========================================
// 3. EDITOR: NHẬP LIỆU & THÊM NODE
// ==========================================
function addChoiceField() {
    const container = document.getElementById('choices-container');
    const row = document.createElement('div');
    row.className = 'choice-input-row';
    
    row.innerHTML = `
        <input type="text" class="choice-text" placeholder="Nội dung đáp án...">
        <input type="text" class="choice-target" placeholder="ID Node đích (VD: node_thang)">
        <button type="button" class="btn-remove-choice" onclick="this.parentElement.remove()">X</button>
    `;
    container.appendChild(row);
}

function addNewNode() {
    let customId = document.getElementById('edit-node-id').value;
    const charName = document.getElementById('edit-char-name').value;
    const dialogue = document.getElementById('edit-dialogue').value;
    const manualNextNode = document.getElementById('edit-next-node').value;
    
    const imgFile = document.getElementById('edit-char-img').files[0];
    const sfxFile = document.getElementById('edit-sfx')?.files[0]; 
    const stopAudio = document.getElementById('edit-stop-audio')?.checked; 

    if (!charName || !dialogue) {
        alert("Vui lòng nhập Tên nhân vật và Nội dung thoại!");
        return;
    }

    const nodeId = customId ? customId : "node_" + Date.now();

    // Xử lý File Ảnh
    let imgUrl = "";
    if (imgFile) imgUrl = URL.createObjectURL(imgFile);

    // Xử lý File Âm thanh (Logic 3 trạng thái)
    let audioConfig = { action: "continue" }; 
    if (stopAudio) {
        audioConfig = { action: "stop" };
    } else if (sfxFile) {
        audioConfig = { action: "play", url: URL.createObjectURL(sfxFile) };
    }

    // Thu thập các đáp án rẽ nhánh
    const choices = [];
    const choiceRows = document.querySelectorAll('.choice-input-row');
    choiceRows.forEach(row => {
        const text = row.querySelector('.choice-text').value;
        const target = row.querySelector('.choice-target').value;
        if (text) {
            choices.push({ text: text, nextNode: target || "end" });
        }
    });

    const newNode = {
        id: nodeId,
        characterName: charName,
        characterSprite: imgUrl,
        dialogueText: dialogue,
        audio: audioConfig,
        choices: choices,
        nextNode: manualNextNode || "end"
    };

    // Nối với node trước đó nếu là đường thẳng
    if (storyData.length > 0 && !customId) {
        let lastNode = storyData[storyData.length - 1];
        if (!lastNode.choices || lastNode.choices.length === 0) {
            lastNode.nextNode = newNode.id;
        }
    }

    storyData.push(newNode);
    
    // Reset Form
    document.getElementById('edit-node-id').value = "";
    document.getElementById('edit-dialogue').value = "";
    document.getElementById('choices-container').innerHTML = ""; 
    document.getElementById('edit-next-node').value = "";
    document.getElementById('edit-char-img').value = "";
    if(document.getElementById('edit-sfx')) document.getElementById('edit-sfx').value = "";
    if(document.getElementById('edit-stop-audio')) document.getElementById('edit-stop-audio').checked = false;

    // Chạy Node nếu đang ở tab Player, ngược lại thì vẽ Sơ đồ
    if (document.getElementById('player-view').classList.contains('active-view')) {
        playNode(newNode.id);
    } else {
        renderFlowchart();
    }
}

// ==========================================
// 4. PLAYER: XỬ LÝ PLAY & HIỆU ỨNG GÕ CHỮ
// ==========================================
function playNode(nodeId) {
    const nodeIndex = storyData.findIndex(s => s.id === nodeId);
    if (nodeIndex === -1) return;
    
    currentNodeIndex = nodeIndex;
    const node = storyData[currentNodeIndex];

    charName.textContent = node.characterName;
    
    // Xử lý Ảnh
    if (node.characterSprite) {
        charSprite.src = node.characterSprite;
        charSprite.style.display = "block";
    } else {
        charSprite.style.display = "none";
    }

    // Xử lý Âm thanh (Stop / Play / Continue)
    if (node.audio) {
        if (node.audio.action === "stop") {
            sfxPlayer.pause();
            sfxPlayer.currentTime = 0;
        } else if (node.audio.action === "play" && node.audio.url) {
            sfxPlayer.src = node.audio.url;
            sfxPlayer.play().catch(e => console.log("Lỗi phát âm thanh:", e));
        }
    }
    
    // Xử lý Nút lựa chọn (Branching Logic)
    choiceContainer.innerHTML = ''; 
    if (node.choices && node.choices.length > 0) {
        isWaitingForChoice = true; 
        choiceContainer.style.display = 'none'; // Ẩn nút đi cho đến khi chữ chạy xong
        
        node.choices.forEach(choice => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = choice.text;
            
            btn.onclick = (e) => {
                e.stopPropagation(); 
                choiceContainer.style.display = 'none'; 
                isWaitingForChoice = false; 
                playNode(choice.nextNode); 
            };
            choiceContainer.appendChild(btn);
        });
    } else {
        isWaitingForChoice = false;
    }
    
    // Bắt đầu hiệu ứng gõ chữ
    dialogueText.textContent = "";
    isTyping = true;
    typeWriter(node.dialogueText, 0);
}

function typeWriter(text, charIndex) {
    if (charIndex < text.length) {
        dialogueText.textContent += text.charAt(charIndex);
        charIndex++;
        typeTimeout = setTimeout(() => typeWriter(text, charIndex), typingSpeed);
    } else {
        isTyping = false; 
        // Hiện nút bấm trắc nghiệm khi đã chạy xong chữ
        const currentNode = storyData[currentNodeIndex];
        if (currentNode.choices && currentNode.choices.length > 0) {
            choiceContainer.style.display = 'flex';
        }
    }
}

// ==========================================
// 5. EVENT LISTENERS & EXPORT
// ==========================================
document.addEventListener('click', (e) => {
    // Không bắt click nếu click vào phần Bảng điều khiển (Editor)
    if (e.target.closest('#editor-panel') || e.target.closest('#tabs-bar')) return;
    // Không cho click chuyển cảnh nếu đang chờ chọn đáp án
    if (isWaitingForChoice && !isTyping) return; 

    if (storyData.length === 0) return;
    const currentNode = storyData[currentNodeIndex];
    
    if (isTyping) {
        clearTimeout(typeTimeout);
        dialogueText.textContent = currentNode.dialogueText;
        isTyping = false;
        
        if (currentNode.choices && currentNode.choices.length > 0) {
            choiceContainer.style.display = 'flex';
        }
    } else {
        if (currentNode.nextNode === "end") {
            charName.textContent = "Hệ thống";
            dialogueText.textContent = "--- KẾT THÚC CÂU CHUYỆN ---";
        } else if (!isWaitingForChoice) { 
            playNode(currentNode.nextNode);
        }
    }
});

function exportData() {
    if(storyData.length === 0) {
        alert("Chưa có dữ liệu để xuất!");
        return;
    }
    const jsonString = JSON.stringify({ scenes: storyData }, null, 2);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(jsonString);
    
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "story_engine_data.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

// Chạy khởi tạo
initEngine();