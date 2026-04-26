let storyData = [];
let currentNodeIndex = 0;
let isTyping = false;
let typingSpeed = 30; // Tốc độ gõ: 30 mili-giây/ký tự
let typeTimeout;


// Lấy các DOM Elements
const bgLayer = document.getElementById('background-layer');
const charSprite = document.getElementById('character-sprite');
const charName = document.getElementById('character-name');
const dialogueText = document.getElementById('dialogue-text');
const sfxPlayer = new Audio(); // Trình phát hiệu ứng âm thanh/giọng nói

// Hàm khởi tạo Engine
function initEngine() {
    storyData = []; // Khởi tạo mảng trống
    updateTimelineUI();
}

// 1. HÀM THÊM NODE MỚI TỪ GIAO DIỆN CHỈNH SỬA
function addNewNode() {
    const charName = document.getElementById('edit-char-name').value;
    const dialogue = document.getElementById('edit-dialogue').value;
    
    // Lấy đối tượng file từ thẻ input
    const imgFile = document.getElementById('edit-char-img').files[0];
    const sfxFile = document.getElementById('edit-sfx').files[0];

    if (!charName || !dialogue) {
        alert("Vui lòng nhập Tên nhân vật và Nội dung thoại!");
        return;
    }

    // Tạo URL ảo cho file ảnh và âm thanh nếu có
    let imgUrl = "";
    let sfxUrl = "";
    if (imgFile) imgUrl = URL.createObjectURL(imgFile);
    if (sfxFile) sfxUrl = URL.createObjectURL(sfxFile);

    const newNode = {
        id: "node_" + Date.now(),
        characterName: charName,
        characterSprite: imgUrl, // Lưu URL ảo của ảnh
        dialogueText: dialogue,
        audio: { sfx: sfxUrl },  // Lưu URL ảo của âm thanh
        nextNode: "end"
    };

    if (storyData.length > 0) {
        storyData[storyData.length - 1].nextNode = newNode.id;
    }

    storyData.push(newNode);
    updateTimelineUI();
    playNode(newNode.id); // Chạy thử ngay lập tức
    
    // Reset form
    document.getElementById('edit-dialogue').value = "";
    document.getElementById('edit-char-img').value = ""; // Xóa file đã chọn
    document.getElementById('edit-sfx').value = "";
}

// 2. HÀM VẼ DANH SÁCH TIMELINE BÊN TRÁI
function updateTimelineUI() {
    const list = document.getElementById('timeline-list');
    list.innerHTML = ""; // Xóa list cũ
    
    storyData.forEach((node, index) => {
        const li = document.createElement('li');
        // Chỉ lấy 20 ký tự đầu của câu thoại để hiển thị cho gọn
        const shortText = node.dialogueText.length > 20 ? node.dialogueText.substring(0, 20) + "..." : node.dialogueText;
        
        li.textContent = `${index + 1}. ${node.characterName}: "${shortText}"`;
        // Khi click vào 1 dòng trong list, player sẽ Preview ngay node đó
        li.onclick = () => playNode(node.id); 
        
        list.appendChild(li);
    });
}

// 3. HÀM XUẤT DỮ LIỆU RA FILE JSON (LƯU LẠI THÀNH QUẢ)
function exportData() {
    if(storyData.length === 0) {
        alert("Chưa có dữ liệu để xuất!");
        return;
    }
    // Chuyển mảng Object thành chuỗi JSON chuẩn
    const jsonString = JSON.stringify({ scenes: storyData }, null, 2);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(jsonString);
    
    // Tạo một thẻ link ảo để kích hoạt trình duyệt tải file xuống
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "kịch_bản_của_tôi.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

// Hàm chạy một phân cảnh (Node)
function playNode(nodeId) {
    const nodeIndex = storyData.findIndex(s => s.id === nodeId);
    if (nodeIndex === -1) return;
    
    currentNodeIndex = nodeIndex;
    const node = storyData[currentNodeIndex];

    charName.textContent = node.characterName;
    
    // Xử lý hiển thị ảnh nhân vật
    if (node.characterSprite) {
        charSprite.src = node.characterSprite;
        charSprite.style.display = "block"; // Hiện ảnh
    } else {
        charSprite.style.display = "none";  // Ẩn ảnh nếu không có file
    }

    // Xử lý phát âm thanh
    if (node.audio && node.audio.sfx) {
        sfxPlayer.src = node.audio.sfx;
        sfxPlayer.play().catch(e => console.log("Lỗi phát âm thanh:", e));
    }
    
    dialogueText.textContent = "";
    isTyping = true;
    typeWriter(node.dialogueText, 0);
}

// Hàm hiệu ứng gõ chữ đệ quy
function typeWriter(text, charIndex) {
    if (charIndex < text.length) {
        dialogueText.textContent += text.charAt(charIndex);
        charIndex++;
        
        // Chú ý: Sau này chúng ta sẽ chèn lệnh phát âm thanh "blip" vào ngay đây
        
        typeTimeout = setTimeout(() => typeWriter(text, charIndex), typingSpeed);
    } else {
        isTyping = false; // Đã gõ xong
    }
}

// Lắng nghe sự kiện click chuột
document.addEventListener('click', () => {
    const currentNode = storyData[currentNodeIndex];
    
    if (isTyping) {
        // Nếu chữ đang chạy mà người dùng click -> Bỏ qua hiệu ứng gõ, hiện full chữ ngay lập tức
        clearTimeout(typeTimeout);
        dialogueText.textContent = currentNode.dialogueText;
        isTyping = false;
    } else {
        // Nếu chữ đã hiện xong, click để chuyển sang Node tiếp theo
        if (currentNode.nextNode === "end") {
            charName.textContent = "Hệ thống";
            dialogueText.textContent = "--- KẾT THÚC CÂU CHUYỆN ---";
        } else {
            playNode(currentNode.nextNode);
        }
    }
});

// Kích hoạt engine
initEngine();