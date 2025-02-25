function convertMarkdownToHtml(text) {
    return text
        // Convert headers
        .replace(/### (.*?)\n/g, '<h3>$1</h3>')
        .replace(/## (.*?)\n/g, '<h2>$1</h2>')
        .replace(/# (.*?)\n/g, '<h1>$1</h1>')
        // Convert bold
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Convert italics
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // Convert bullet points
        .replace(/- (.*?)(\n|$)/g, '<li>$1</li>')
        // Wrap lists in ul
        .replace(/(<li>.*?<\/li>)\n*/g, '<ul>$1</ul>')
        // Convert numbered lists
        .replace(/\d+\. (.*?)(\n|$)/g, '<li>$1</li>')
        // Convert line breaks
        .replace(/\n/g, '<br>');
} 

// Create and append selection popup immediately
const selectionPopup = document.createElement('div');
selectionPopup.className = 'selection-popup';
selectionPopup.innerHTML = `
    <button class="selection-icon edit-icon">✏️</button>
    <button class="selection-icon copy-icon">📋</button>
    <button class="selection-icon translate-icon">🌐</button>
    <button class="selection-icon chat-icon">
        <img src="${chrome.runtime.getURL('icons/icon16.png')}" alt="Chat" />
        <span class="icon-text">Chat with AI</span>
    </button>
`;
document.body.appendChild(selectionPopup);

// Create and append chat popup
const chatPopup = document.createElement('div');
chatPopup.className = 'chat-popup';
chatPopup.innerHTML = `
    <div class="chat-popup-header">
        <span>Quick Ask</span>
        <button class="close-chat">×</button>
    </div>
    <div class="chat-popup-messages"></div>
    <div class="chat-popup-input">
        <textarea placeholder="Ask about the selected text..."></textarea>
        <button class="send-message">➤</button>
    </div>
`;
document.body.appendChild(chatPopup);

let selectedContext = '';

// Handle text selection
document.addEventListener('mouseup', (e) => {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (selectedText && !selectionPopup.contains(e.target) && !chatPopup.contains(e.target)) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        selectionPopup.style.left = `${rect.left + window.scrollX}px`;
        selectionPopup.style.top = `${rect.top + window.scrollY - 45}px`;
        selectionPopup.style.display = 'flex';
    } else if (!selectedText) {
        selectionPopup.style.display = 'none';
    }
});

// Update the popup button click handler
selectionPopup.addEventListener('click', (e) => {
    // Check if the click was on the chat icon or its image
    const chatButton = e.target.closest('.chat-icon');
    if (chatButton) {
        selectedContext = window.getSelection().toString().trim();
        
        const rect = selectionPopup.getBoundingClientRect();
        chatPopup.style.left = `${rect.left}px`;
        chatPopup.style.top = `${rect.bottom + 10}px`;
        chatPopup.style.display = 'flex';
        
        // Add selected text as context in the chat window
        const messagesContainer = chatPopup.querySelector('.chat-popup-messages');
        messagesContainer.innerHTML = `
            <div class="context-message">
                Selected text: "${selectedContext}"
            </div>
        `;
    }
});

// Handle send message in popup
chatPopup.querySelector('.chat-popup-input button').addEventListener('click', async () => {
    const textarea = chatPopup.querySelector('textarea');
    const userMessage = textarea.value.trim();
    if (!userMessage) return;
    
    const messagesContainer = chatPopup.querySelector('.chat-popup-messages');
    
    try {
        // Add user message to chat
        messagesContainer.innerHTML += `
            <div class="user-message">
                ${userMessage}
            </div>
        `;
        
        textarea.value = '';
        
        // Show loading indicator
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'ai-message loading';
        loadingDiv.textContent = 'AI is thinking...';
        messagesContainer.appendChild(loadingDiv);

        // Send message with retry logic
        const response = await sendMessageWithRetry(userMessage, selectedContext);
        
        // Remove loading indicator
        loadingDiv.remove();
        
        if (response.error) {
            throw new Error(response.error);
        }
        
        if (response.answer) {
            const formattedAnswer = convertMarkdownToHtml(response.answer);
            messagesContainer.innerHTML += `
                <div class="ai-message">
                    ${formattedAnswer}
                </div>
            `;
        } else {
            throw new Error('Invalid response format from AI');
        }
        
    } catch (error) {
        console.error('Chat error:', error);
        const errorMessage = error.message || 'An unknown error occurred';
        messagesContainer.innerHTML += `
            <div class="error-message">
                Error: ${errorMessage}. Please try again.
            </div>
        `;
    }
    
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

// Add retry logic for sending messages
async function sendMessageWithRetry(message, context, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await new Promise((resolve, reject) => {
                if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
                    reject(new Error('Chrome runtime not available'));
                    return;
                }

                chrome.runtime.sendMessage({
                    action: "chat",
                    prompt: message,
                    context: context
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(response);
                    }
                });
            });
        } catch (error) {
            console.error(`Attempt ${i + 1} failed:`, error);
            if (i === maxRetries - 1) {
                throw error;
            }
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
}

// Close popups when clicking outside
document.addEventListener('mousedown', (e) => {
    if (!chatPopup.contains(e.target) && !selectionPopup.contains(e.target)) {
        chatPopup.style.display = 'none';
        if (!window.getSelection().toString().trim()) {
            selectionPopup.style.display = 'none';
        }
    }
});

// Handle chat popup close button
document.querySelector('.close-chat').addEventListener('click', () => {
    chatPopup.style.display = 'none';
});

// Handle Enter key for sending messages
chatPopup.querySelector('textarea').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatPopup.querySelector('.chat-popup-input button').click();
    }
});

// Make sure the chat popup is visible
const chatPopupStyles = {
    position: 'fixed',
    display: 'none', // Initially hidden
    flexDirection: 'column',
    background: 'white',
    border: '1px solid #ccc',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    zIndex: '10000',
    width: '300px',
    height: '400px'
};

// Apply styles to chat popup
Object.assign(chatPopup.style, chatPopupStyles);