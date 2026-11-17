// ---------- Live Chat Widget ----------
// Tawk.to integration with fallback to WhatsApp/email.

const CHAT_CONFIG = {
  tawkPropertyId: '', // Fill in your Tawk.to Property ID
  tawkWidgetId: '',   // Fill in your Tawk.to Widget ID
  whatsappNumber: '+1XXXXXXXXXX', // Fallback WhatsApp
  supportEmail: 'supportrepslvbags@gmail.com',
  businessHours: 'Mon-Fri 9AM-6PM EST',
  offlineMessage: 'We are currently offline. Leave a message and we will reply within 24 hours.'
};

let chatInitialized = false;
let chatOpen = false;

// ---------- Tawk.to Integration ----------
function initTawkTo() {
  if (!CHAT_CONFIG.tawkPropertyId || !CHAT_CONFIG.tawkWidgetId) {
    console.log('Tawk.to not configured, using fallback');
    return false;
  }
  
  // Load Tawk.to script
  var Tawk_API = Tawk_API || {}, Tawk_LoadStart = new Date();
  (function(){
    var s1=document.createElement("script"),s0=document.getElementsByTagName("script")[0];
    s1.async=true;
    s1.src='https://embed.tawk.to/'+CHAT_CONFIG.tawkPropertyId+'/'+CHAT_CONFIG.tawkWidgetId;
    s1.charset='UTF-8';
    s1.setAttribute('crossorigin','*');
    s0.parentNode.insertBefore(s1,s0);
  })();
  
  chatInitialized = true;
  return true;
}

// ---------- Fallback Chat (localStorage-based) ----------
function initFallbackChat() {
  // Create chat UI if Tawk.to not available
  if (document.getElementById('chatWidget')) return;
  
  const widget = document.createElement('div');
  widget.id = 'chatWidget';
  widget.innerHTML = `
    <div class="chat-button" id="chatButton">
      <span class="chat-icon">💬</span>
      <span class="chat-label">Chat</span>
      <span class="chat-status" id="chatStatus"></span>
    </div>
    <div class="chat-window hidden" id="chatWindow">
      <div class="chat-header">
        <div class="chat-header-info">
          <h4>Customer Support</h4>
          <p class="chat-status-text" id="chatStatusText">Online</p>
        </div>
        <button class="chat-close" id="chatClose">✕</button>
      </div>
      <div class="chat-messages" id="chatMessages">
        <div class="chat-message bot">
          <p>Hi! How can we help you today?</p>
        </div>
      </div>
      <div class="chat-quick-questions" id="chatQuickQuestions">
        <button class="quick-q" data-q="Where is my order?">Track Order</button>
        <button class="quick-q" data-q="What is your return policy?">Returns</button>
        <button class="quick-q" data-q="Do you ship internationally?">Shipping</button>
        <button class="quick-q" data-q="How do I pay?">Payment</button>
      </div>
      <div class="chat-input-area">
        <input type="text" id="chatInput" placeholder="Type your message..." maxlength="500">
        <button id="chatSend">Send</button>
      </div>
      <div class="chat-footer">
        <p>Or reach us at <a href="mailto:${CHAT_CONFIG.supportEmail}">${CHAT_CONFIG.supportEmail}</a></p>
        <p class="chat-hours">${CHAT_CONFIG.businessHours}</p>
      </div>
    </div>
  `;
  
  document.body.appendChild(widget);
  
  // Event listeners
  document.getElementById('chatButton').onclick = toggleChat;
  document.getElementById('chatClose').onclick = toggleChat;
  document.getElementById('chatSend').onclick = sendMessage;
  document.getElementById('chatInput').onkeypress = (e) => {
    if (e.key === 'Enter') sendMessage();
  };
  
  // Quick questions
  document.querySelectorAll('.quick-q').forEach(btn => {
    btn.onclick = () => {
      const q = btn.dataset.q;
      document.getElementById('chatInput').value = q;
      sendMessage();
    };
  });
  
  // Update status based on time
  updateChatStatus();
  setInterval(updateChatStatus, 60000); // Check every minute
}

function updateChatStatus() {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  const isBusinessHours = day >= 1 && day <= 5 && hour >= 9 && hour <= 18;
  
  const statusEl = document.getElementById('chatStatus');
  const statusTextEl = document.getElementById('chatStatusText');
  
  if (statusEl) {
    statusEl.textContent = isBusinessHours ? 'Online' : 'Offline';
    statusEl.className = 'chat-status ' + (isBusinessHours ? 'online' : 'offline');
  }
  if (statusTextEl) {
    statusTextEl.textContent = isBusinessHours ? 'Online - We reply quickly' : 'Offline - Leave a message';
  }
}

function toggleChat() {
  chatOpen = !chatOpen;
  const window = document.getElementById('chatWindow');
  const button = document.getElementById('chatButton');
  
  if (window) window.classList.toggle('hidden', !chatOpen);
  if (button) button.classList.toggle('active', chatOpen);
}

function sendMessage() {
  const input = document.getElementById('chatInput');
  const messages = document.getElementById('chatMessages');
  const message = input.value.trim();
  
  if (!message) return;
  
  // Add user message
  const userMsg = document.createElement('div');
  userMsg.className = 'chat-message user';
  userMsg.innerHTML = `<p>${escapeHtml(message)}</p>`;
  messages.appendChild(userMsg);
  
  // Clear input
  input.value = '';
  
  // Scroll to bottom
  messages.scrollTop = messages.scrollHeight;
  
  // Simulate bot response (in production, this would go to your backend)
  setTimeout(() => {
    const botMsg = document.createElement('div');
    botMsg.className = 'chat-message bot';
    botMsg.innerHTML = `<p>Thank you for your message! Our team will get back to you shortly. For immediate assistance, email us at ${CHAT_CONFIG.supportEmail}</p>`;
    messages.appendChild(botMsg);
    messages.scrollTop = messages.scrollHeight;
  }, 1000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ---------- Init ----------
function initChat() {
  // Try Tawk.to first
  if (initTawkTo()) {
    console.log('Tawk.to chat initialized');
    return;
  }
  
  // Fallback to custom chat
  initFallbackChat();
  console.log('Fallback chat initialized');
}

// Auto-init on page load
document.addEventListener('DOMContentLoaded', initChat);
