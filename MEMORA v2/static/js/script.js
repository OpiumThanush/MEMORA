let selectedJournal = "";
let chatHistory = [];
let isListening = false;
let recognitionActive = false;
let speechRecognition = null;
let speechSynthesis = window.speechSynthesis;
let voiceMode = false;
let currentlySpeaking = false;
let lastAIMessage = null;

// Initialize speech recognition
function initSpeechRecognition() {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        speechRecognition = new SpeechRecognition();
        speechRecognition.continuous = true;
        speechRecognition.interimResults = true;
        speechRecognition.lang = 'en-US';

        speechRecognition.onstart = function() {
            recognitionActive = true;
            updateVoiceFeedback("Listening...");
            document.getElementById("voiceButton").classList.add("listening");
        };

        speechRecognition.onend = function() {
            recognitionActive = false;
            if (isListening) {
                // Restart if we're still in listening mode but recognition ended
                speechRecognition.start();
            } else {
                updateVoiceFeedback("Click the microphone to start speaking");
                document.getElementById("voiceButton").classList.remove("listening");
            }
        };

        let finalTranscript = '';
        
        speechRecognition.onresult = function(event) {
            let interimTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                
                if (event.results[i].isFinal) {
                    finalTranscript += transcript + ' ';
                } else {
                    interimTranscript += transcript;
                }
            }
            
            if (interimTranscript) {
                updateVoiceFeedback(interimTranscript);
            }
            
            if (finalTranscript) {
                updateVoiceFeedback("Processing: " + finalTranscript);
                
                // Stop listening when we have a final result
                stopListening();
                
                // Process the voice input
                if (finalTranscript.trim()) {
                    submitVoiceInput(finalTranscript.trim());
                    finalTranscript = '';
                }
            }
        };

        speechRecognition.onerror = function(event) {
            console.error("Speech recognition error:", event.error);
            updateVoiceFeedback("Error: " + event.error);
            isListening = false;
            document.getElementById("voiceButton").classList.remove("listening");
        };
        
        return true;
    } else {
        console.error("Speech recognition not supported in this browser");
        updateVoiceFeedback("Speech recognition not supported in this browser");
        return false;
    }
}

function startListening() {
    if (!speechRecognition) {
        const initialized = initSpeechRecognition();
        if (!initialized) return;
    }
    
    try {
        isListening = true;
        speechRecognition.start();
    } catch (error) {
        console.error("Error starting speech recognition:", error);
    }
}

function stopListening() {
    isListening = false;
    if (speechRecognition && recognitionActive) {
        try {
            speechRecognition.stop();
        } catch (error) {
            console.error("Error stopping speech recognition:", error);
        }
    }
}

function toggleVoiceMode() {
    // Change to use the checked state directly instead of reversing it
    voiceMode = document.getElementById("voiceToggle").checked;
    const textInputContainer = document.getElementById("textInputContainer");
    const voiceInputContainer = document.getElementById("voiceInputContainer");
    
    if (voiceMode) {
        textInputContainer.style.display = "none";
        voiceInputContainer.style.display = "flex";
        
        // Initialize speech recognition if needed
        if (!speechRecognition) {
            initSpeechRecognition();
        }
    } else {
        textInputContainer.style.display = "flex";
        voiceInputContainer.style.display = "none";
        
        // Stop listening if active
        stopListening();
        
        // Stop speaking if active
        if (currentlySpeaking) {
            stopSpeaking();
        }
    }
}

function updateVoiceFeedback(text) {
    const feedback = document.getElementById("voiceFeedback");
    feedback.textContent = text;
}

function submitVoiceInput(text) {
    addMessage(text, true);
    processUserInput(text);
}

function speakText(text) {
    if (!voiceMode) return;
    
    // First, stop any ongoing speech
    stopSpeaking();
    
    // Clean the text - remove HTML tags
    const cleanText = text.replace(/<[^>]*>?/gm, '');
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Set voice preferences
    const voices = speechSynthesis.getVoices();
    const preferredVoice = voices.find(voice => 
        voice.name.includes("Female") || 
        voice.name.includes("Google") || 
        voice.name.includes("Natural")
    );
    
    if (preferredVoice) {
        utterance.voice = preferredVoice;
    }
    
    // Set other properties for natural sound
    utterance.rate = 1.0;  // Normal speed
    utterance.pitch = 1.0; // Normal pitch
    utterance.volume = 1.0; // Full volume
    
    // Add highlighting to the message being spoken
    if (lastAIMessage) {
        lastAIMessage.classList.add("speaking");
    }
    
    currentlySpeaking = true;
    
    utterance.onend = function() {
        currentlySpeaking = false;
        if (lastAIMessage) {
            lastAIMessage.classList.remove("speaking");
        }
        
        // Automatically start listening after AI finishes speaking
        if (voiceMode) {
            setTimeout(() => {
                startListening();
            }, 500);
        }
    };
    
    speechSynthesis.speak(utterance);
}

function stopSpeaking() {
    if (speechSynthesis && speechSynthesis.speaking) {
        speechSynthesis.cancel();
        currentlySpeaking = false;
        
        if (lastAIMessage) {
            lastAIMessage.classList.remove("speaking");
        }
    }
}

function processUserInput(input) {
    // Get journal content directly from session storage
    const journalContent = sessionStorage.getItem('journalContent');
    
    if (!journalContent) {
        const message = "Please select a journal before chatting.";
        alert(message);
        if (voiceMode) {
            speakText(message);
        }
        return;
    }
    
    if (!input.trim()) {
        const message = "Please enter a question or prompt.";
        alert(message);
        if (voiceMode) {
            speakText(message);
        }
        return;
    }
    
    document.getElementById("chatInput").value = "";
    
    const chatMessages = document.getElementById("chatMessages");
    const loadingDiv = document.createElement("div");
    loadingDiv.className = "message ai";
    loadingDiv.innerHTML = `
        <div class="message-content">
            <div class="loading-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            journal: journalContent,  // Use the journal content from session storage
            prompt: input 
        })
    }).then(response => response.json())
        .then(data => {
            chatMessages.removeChild(loadingDiv);
            
            // Store a reference to this response content div
            const messageDiv = addMessage(data.response, false);
            lastAIMessage = messageDiv;
            
            // If in voice mode, speak the response
            if (voiceMode) {
                speakText(data.response);
            }
        })
        .catch(error => {
            console.error("Error chatting with AI:", error);
            chatMessages.removeChild(loadingDiv);
            
            const errorMessage = `<p style="color: #e74c3c;">⚠️ An error occurred while processing your request. Please try again.</p>`;
            addMessage(errorMessage, false);
            
            if (voiceMode) {
                speakText("An error occurred while processing your request. Please try again.");
            }
        });
}

function showNotification(message) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function formatTime() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // Convert 0 to 12
    return `${hours}:${minutes} ${ampm}`;
}

function saveJournal(isAutoSave = false) {
    const entry = document.getElementById("journalEntry").value;
    const filename = document.getElementById("filename").value;
    
    if (!entry.trim() || !filename.trim()) {
        if (!isAutoSave) showNotification("Please enter both content and filename.");
        return;
    }
    
    fetch("/save_journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry, filename })
    })
    .then(response => response.json())
    .then(data => {
        if (isAutoSave) {
            const timeStr = formatTime();
            showNotification("Journal auto-saved");
            const status = document.getElementById('autoSaveStatus');
            if (status) {
                status.textContent = `Last auto-saved: ${timeStr}`;
                status.style.display = 'inline';
            }
        } else {
            showNotification(data.message);
        }
    })
    .catch(error => {
        if (!isAutoSave) showNotification("Error saving: " + error);
        console.error("Save error:", error);
    });
}

function listJournals() {
    fetch("/list_journals")
        .then(response => response.json())
        .then(data => {
            const list = document.getElementById("journalList");
            list.innerHTML = "";
            if (data.journals.length === 0) {
                const item = document.createElement("li");
                item.textContent = "No journals found. Create one!";
                item.style.cursor = "default";
                list.appendChild(item);
                return;
            }
            
            data.journals.forEach(file => {
                const item = document.createElement("li");
                const journalContainer = document.createElement("div");
                journalContainer.className = "journal-item";
                
                const nameSpan = document.createElement("span");
                nameSpan.textContent = file;
                nameSpan.onclick = () => selectJournal(file, item);
                
                const deleteBtn = document.createElement("button");
                deleteBtn.className = "delete-btn";
                deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    deleteJournal(file, item);
                };
                
                journalContainer.appendChild(nameSpan);
                journalContainer.appendChild(deleteBtn);
                item.appendChild(journalContainer);
                
                if (file === selectedJournal) {
                    item.classList.add("selected");
                }
                list.appendChild(item);
            });
        })
        .catch(error => {
            console.error("Error listing journals:", error);
        });
}

function deleteJournal(filename, item) {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
        return;
    }
    
    fetch("/delete_journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename })
    }).then(response => response.json())
      .then(data => {
          if (data.message) {
              // Clear selection if deleted journal was selected
              if (filename === selectedJournal) {
                  selectedJournal = "";
                  sessionStorage.removeItem('selectedJournal');
                  sessionStorage.removeItem('journalContent');
                  
                  // Clear preview if it exists
                  const previewContent = document.querySelector('.preview-content');
                  if (previewContent) {
                      previewContent.textContent = "";
                  }
                  
                  // Clear journal entry if on write page
                  const journalEntry = document.getElementById("journalEntry");
                  if (journalEntry) {
                      journalEntry.value = "";
                  }
              }
              
              // Remove the item from the list
              item.remove();
              
              // Refresh the list
              listJournals();
          }
      })
      .catch(error => {
          console.error("Error deleting journal:", error);
          alert("Error deleting journal.");
      });
}

function selectJournal(filename, item) {
    selectedJournal = filename;
    sessionStorage.setItem('selectedJournal', filename);
    
    document.querySelectorAll("#journalList li").forEach(li => li.classList.remove("selected"));
    item.classList.add("selected");
    
    // Load journal content and store it
    fetch("/load_journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename })
    }).then(response => response.json())
      .then(data => {
          sessionStorage.setItem('journalContent', data.entry);
          
          // Update preview content
          const previewContent = document.querySelector('.preview-content');
          if (previewContent) {
              previewContent.textContent = data.entry;
          }
          
          // Update journal details panel
          updateJournalDetails(filename, data.entry);
          
          // Update journal entry if on write page
          const journalEntry = document.getElementById("journalEntry");
          if (journalEntry) {
              journalEntry.value = data.entry;
          }
          
          // Update chat messages if on chat page
          const chatMessages = document.getElementById("chatMessages");
          if (chatMessages) {
              chatMessages.innerHTML = `
                  <div class="message ai">
                      <div class="message-content">
                          Journal "${filename}" loaded. What would you like to know about it?
                      </div>
                  </div>
              `;
          }
      });
}

function updateJournalDetails(filename, content) {
    const detailsPanel = document.getElementById('journalDetails');
    if (!detailsPanel) return;
    
    // Parse filename for date and title
    const [date, ...titleParts] = filename.replace('.txt', '').split('_');
    const title = titleParts.join(' ');
    
    // Calculate word and character count
    const wordCount = content.trim().split(/\s+/).length;
    const charCount = content.length;
    
    // Update the details
    document.getElementById('journalTitle').textContent = title;
    document.getElementById('journalDate').textContent = formatDate(date);
    document.getElementById('journalLength').textContent = 
        `${wordCount} words, ${charCount} characters`;
    
    // Show the panel with animation
    detailsPanel.classList.remove('hidden');
    setTimeout(() => {
        detailsPanel.classList.add('visible');
    }, 10);
}

function formatDate(dateStr) {
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (e) {
        return dateStr; // Fallback to original string if parsing fails
    }
}

function loadJournal(filename) {
    fetch("/load_journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename })
    }).then(response => response.json())
      .then(data => {
          document.getElementById("journalEntry").value = data.entry;
      })
      .catch(error => {
          console.error("Error loading journal:", error);
          alert("Error loading journal.");
      });
}

function addMessage(content, isUser) {
    const chatMessages = document.getElementById("chatMessages");
    const messageDiv = document.createElement("div");
    messageDiv.className = isUser ? "message user" : "message ai";
    
    const messageContent = document.createElement("div");
    messageContent.className = "message-content";
    messageContent.innerHTML = isUser ? content : parseAndFormatResponse(content);
    
    messageDiv.appendChild(messageContent);
    chatMessages.appendChild(messageDiv);
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Save chat history to localStorage
    localStorage.setItem('chatHistory', chatMessages.innerHTML);
    
    chatHistory.push({
        role: isUser ? "user" : "ai",
        content: content
    });
    
    return messageContent;
}

function chatWithAI() {
    const prompt = document.getElementById("chatInput").value;
    
    // Add the user's input to the chat before processing
    if (prompt.trim()) {
        addMessage(prompt, true);
    }
    
    processUserInput(prompt);
}

function parseAndFormatResponse(text) {
    if (!text) return "<p>No response received.</p>";
    
    if (text.includes("⚠️")) {
        return `<p style="color: #e74c3c; font-weight: bold;">${text}</p>`;
    }
    
    text = text.replace(/^📌 <strong>Here's what I found:<\/strong><br><br><ul>/, '');
    text = text.replace(/<\/ul>$/, '');
    
    const emojiPattern = /• ([^:]+): (\d+)\/100 ([\p{Emoji}\u200d♂️\u200d♀️]+)/ug;
    const hasEmojiFormatting = emojiPattern.test(text);
    
    if (hasEmojiFormatting) {
        let formatted = '';
        
        emojiPattern.lastIndex = 0;
        
        text = text.replace(emojiPattern, function(match, category, value, emoji) {
            return `<div><span style="margin-right: 5px;">${emoji}</span> <strong>${category}:</strong> ${value}/100</div>`;
        });
        
        return text;
    }
    
    return convertMarkdownToHTML(text);
}

function convertMarkdownToHTML(text) {
    text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/(?<!\*)\*([^\*]+)\*(?!\*)/g, "<em>$1</em>");
    text = text.replace(/^# (.*$)/gm, "<h3>$1</h3>");
    text = text.replace(/^## (.*$)/gm, "<h4>$1</h4>");
    
    let hasBulletPoints = /^[•\-*] /m.test(text);
    
    if (hasBulletPoints) {
        let lines = text.split('\n');
        let inList = false;
        let result = '';
        
        for (let line of lines) {
            if (/^[•\-*] /.test(line)) {
                if (!inList) {
                    result += '<ul>';
                    inList = true;
                }
                
                let bulletContent = line.replace(/^[•\-*] /, '');
                result += `<li>${bulletContent}</li>`;
            } else {
                if (inList) {
                    result += '</ul>';
                    inList = false;
                }
                
                if (line.trim()) {
                    result += line + '\n';
                }
            }
        }
        
        if (inList) {
            result += '</ul>';
        }
        
        text = result;
    }
    
    if (!text.includes("<p>") && !text.includes("<div>") && !text.includes("<ul>")) {
        text = `<p>${text}</p>`;
    }
    
    text = text.replace(/<br><br>/g, '</p><p>');
    
    return text;
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    const chatInput = document.getElementById('chatInput');
    const voiceToggle = document.getElementById('voiceToggle');
    const voiceButton = document.getElementById('voiceButton');
    
    // Handle Enter key in text input
    chatInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            chatWithAI();
        }
    });
    
    // Handle toggle switch for voice mode
    voiceToggle.addEventListener('change', function() {
        toggleVoiceMode();
    });
    
    // Handle voice button click
    voiceButton.addEventListener('click', function() {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    });
    
    // Load available voices for speech synthesis
    if (speechSynthesis) {
        speechSynthesis.onvoiceschanged = function() {
            // Just to make sure voices are loaded
            speechSynthesis.getVoices();
        };
    }
});

window.onload = function() {
    listJournals();
    
    // Check for stored journal on page load
    const storedJournal = sessionStorage.getItem('selectedJournal');
    if (storedJournal) {
        selectedJournal = storedJournal;
        // Update UI to show selected journal
        const journalList = document.getElementById("journalList");
        if (journalList) {
            setTimeout(() => {
                const items = journalList.getElementsByTagName("li");
                for (let item of items) {
                    if (item.textContent === storedJournal) {
                        item.classList.add("selected");
                        break;
                    }
                }
            }, 100); // Small delay to ensure list is populated
        }
    }
    
    // Initialize speech capabilities
    if ('speechSynthesis' in window) {
        // Speech synthesis is supported
        speechSynthesis = window.speechSynthesis;
    } else {
        console.warn("Speech synthesis not supported in this browser");
    }
};