/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Chat, GenerateContentResponse, Content, Part } from '@google/genai';

// --- Type Declarations for Speech Recognition API ---
interface SpeechRecognitionErrorEventInit extends EventInit { error?: string; message?: string; }
declare class SpeechRecognitionErrorEvent extends Event { constructor(type: string, eventInitDict: SpeechRecognitionErrorEventInit); readonly error: string; readonly message: string; }
interface SpeechRecognitionAlternative { readonly transcript: string; readonly confidence: number; }
interface SpeechRecognitionResult { readonly isFinal: boolean; readonly length: number; item(index: number): SpeechRecognitionAlternative; [index: number]: SpeechRecognitionAlternative; }
interface SpeechRecognitionResultList { readonly length: number; item(index: number): SpeechRecognitionResult; [index: number]: SpeechRecognitionResult; }
interface SpeechRecognitionEvent extends Event { readonly resultIndex: number; readonly results: SpeechRecognitionResultList; }
interface SpeechRecognition extends EventTarget { grammars: any; lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number; serviceURI?: string; start(): void; stop(): void; abort(): void; onaudiostart: ((this: SpeechRecognition, ev: Event) => any) | null; onsoundstart: ((this: SpeechRecognition, ev: Event) => any) | null; onspeechstart: ((this: SpeechRecognition, ev: Event) => any) | null; onspeechend: ((this: SpeechRecognition, ev: Event) => any) | null; onsoundend: ((this: SpeechRecognition, ev: Event) => any) | null; onaudioend: ((this: SpeechRecognition, ev: Event) => any) | null; onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null; onnomatch: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null; onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null; onstart: ((this: SpeechRecognition, ev: Event) => any) | null; onend: ((this: SpeechRecognition, ev: Event) => any) | null; }
declare var SpeechRecognition: { prototype: SpeechRecognition; new(): SpeechRecognition; } | undefined;
declare var webkitSpeechRecognition: { prototype: SpeechRecognition; new(): SpeechRecognition; } | undefined;
// --- End of Type Declarations ---

// --- Interfaces ---
interface CustomMode {
    name: string;
    instruction: string;
}

// --- Constants ---
const GEMINI_TEXT_MODEL = 'gemini-2.5-flash-preview-04-17';
const IMAGEN_MODEL = 'imagen-3.0-generate-002';
const LOCAL_STORAGE_THEME_KEY = 'guroai-theme';
const LOCAL_STORAGE_ACCENT_KEY = 'guroai-accent-color';
const LOCAL_STORAGE_CUSTOM_MODES_KEY = 'guroai-custom-modes';
const API_KEY = "AIzaSyCMt2khDB5edgloPdB7D9QSgsY9dbgOd50"; // User provided API Key

// --- State ---
let currentChat: Chat | null = null;
let currentMode = 'Normal';
let currentCustomInstruction: string | null = null; // For custom modes
let uploadedImageBase64: string | null = null;
let uploadedImageMimeType: string | null = null;
let uploadedPdfFile: File | null = null;
let isRecognizingSpeech = false;
let recognition: SpeechRecognition | null = null;
let customModes: CustomMode[] = [];
let editingModeIndex: number = -1;
let currentSpokenText: string | null = null;


// --- DOM Elements ---
const messagesContainer = document.getElementById('messages-container') as HTMLDivElement;
const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
const sendButton = document.getElementById('send-button') as HTMLButtonElement;
const modeSelect = document.getElementById('mode-select') as HTMLSelectElement;
const themeToggleButton = document.getElementById('theme-toggle') as HTMLButtonElement;
const fullscreenToggleButton = document.getElementById('fullscreen-toggle') as HTMLButtonElement;
const clearChatButton = document.getElementById('clear-chat') as HTMLButtonElement;
const voiceInputToggleButton = document.getElementById('voice-input-toggle') as HTMLButtonElement;
const languageSelect = document.getElementById('language-select') as HTMLSelectElement;
const imageUpload = document.getElementById('image-upload') as HTMLInputElement;
const pdfUpload = document.getElementById('pdf-upload') as HTMLInputElement;
const imagePreviewContainer = document.getElementById('image-preview-container') as HTMLDivElement;
const imagePreview = document.getElementById('image-preview') as HTMLImageElement;
const removeImagePreviewButton = document.getElementById('remove-image-preview') as HTMLButtonElement;
const pdfPreviewContainer = document.getElementById('pdf-preview-container') as HTMLDivElement;
const pdfPreviewName = document.getElementById('pdf-preview-name') as HTMLParagraphElement;
const removePdfPreviewButton = document.getElementById('remove-pdf-preview') as HTMLButtonElement;
const loadingIndicator = document.getElementById('loading-indicator') as HTMLDivElement;
const pdfInfo = document.getElementById('pdf-info') as HTMLElement;
const colorPicker = document.getElementById('color-picker') as HTMLDivElement;

// Custom Mode Modal Elements
const manageModesButton = document.getElementById('manage-modes-button') as HTMLButtonElement | null;
const customModeModal = document.getElementById('custom-mode-modal') as HTMLDivElement | null;
const customModeModalCloseButton = customModeModal?.querySelector('.modal-close-button') as HTMLButtonElement | null;
const customModesListElement = document.getElementById('custom-modes-list') as HTMLUListElement | null;
const noCustomModesLi = customModesListElement?.querySelector('.no-custom-modes') as HTMLLIElement | null;
const customModeForm = document.getElementById('custom-mode-form') as HTMLFormElement | null;
const customModeFormTitle = document.getElementById('custom-mode-form-title') as HTMLHeadingElement | null;
const customModeNameInput = document.getElementById('custom-mode-name-input') as HTMLInputElement | null;
const customModeInstructionInput = document.getElementById('custom-mode-instruction-input') as HTMLTextAreaElement | null;
const saveCustomModeButton = document.getElementById('save-custom-mode-button') as HTMLButtonElement | null;
const cancelEditCustomModeButton = document.getElementById('cancel-edit-custom-mode-button') as HTMLButtonElement | null;
const editingModeIndexInput = document.getElementById('editing-mode-index') as HTMLInputElement | null;


// --- Gemini API Initialization ---
let ai: GoogleGenAI;
try {
    if (!API_KEY) {
        throw new Error("API_KEY is missing.");
    }
    ai = new GoogleGenAI({ apiKey: API_KEY });
} catch (error) {
    console.error("Failed to initialize GoogleGenAI:", error);
    displayMessage("Error: Could not initialize AI. API_KEY might be missing or invalid.", 'error');
    if (chatInput) chatInput.disabled = true;
    if (sendButton) sendButton.disabled = true;
}

// --- System Instructions for Modes ---
const systemInstructions: Record<string, Content> = {
    Normal: { parts: [{ text: "You are GuroAI, a helpful and knowledgeable assistant. Be concise and friendly." }] },
    News: { parts: [{ text: "You are GuroAI, a news anchor. Provide the latest, factual information on the topic. Use Google Search for up-to-date details. If relevant, try to describe an image that could accompany this news. Always cite your sources clearly by listing the URLs from Google Search grounding chunks." }] },
    Fitness: { parts: [{ text: "You are GuroAI, a world-class fitness coach and nutritionist. Provide detailed, structured workout plans (e.g., Day 1: Chest & Triceps, Exercise 1: Bench Press - 3 sets of 8-12 reps), personalized meal plans (e.g., Breakfast: Oatmeal with berries; Lunch: Grilled chicken salad), and actionable fitness advice. Be highly motivating and use encouraging language. When mentioning an exercise, ALWAYS suggest a YouTube search for it to provide a visual guide (e.g., 'For proper form, search on YouTube: \"how to do bicep curls form\"' or 'You can find videos for a good dumbbell row by searching YouTube for \"dumbbell row technique\"')." }] },
    Code: { parts: [{ text: "You are GuroAI, an expert programmer and senior software engineer. Provide accurate, efficient, and readable code examples in various languages. Explain complex programming concepts clearly with analogies and best practices. Always format code using markdown code blocks with language specifiers (e.g., ```python\n# Your Python code here\n```). Offer debugging tips and consider code efficiency, readability, and maintainability in your solutions. Be very thorough, precise, and think like a top-tier software architect when providing solutions or advice." }] },
    Thinker: { parts: [{ text: "You are GuroAI, a profound philosopher and deep thinker. Engage in profound metacognition. Analyze user prompts from multiple, often contrasting, perspectives. Explore underlying assumptions, implications, and second-order effects. Provide verbose, well-reasoned, and insightful responses that delve deeply into the 'why' and 'how.' Use sophisticated vocabulary, draw from diverse fields of knowledge, and engage in Socratic questioning if appropriate to stimulate further thought. Do not shy away from complexity, ambiguity, or length if it serves the purpose of deep, comprehensive understanding. Take your time to formulate truly comprehensive and enlightening thoughts, like a sage contemplating complex universal truths." }] },
    Math: { parts: [{ text: "You are GuroAI, a brilliant mathematician. Solve mathematical problems of all levels, from basic arithmetic to advanced calculus, abstract algebra, and topology. Provide clear, rigorous, step-by-step solutions and proofs where applicable. Explain mathematical theorems, axioms, and concepts with utmost precision and clarity. Use standard mathematical notation (LaTeX is preferred if the output format allows, otherwise use clear textual representation). Clearly define all variables and assumptions. If a problem is ambiguous or underspecified, ask for clarification before attempting a solution. Aim to not just solve, but to elucidate the underlying mathematical principles." }] },
};

// --- Speech Recognition Setup ---
const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
if (SpeechRecognitionAPI) {
    recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.lang = languageSelect.value;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
        const speechResult = event.results[0][0].transcript;
        chatInput.value = speechResult;
        autoAdjustTextareaHeight(chatInput);
        stopSpeechRecognition();
        sendMessage();
    };
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error("Speech recognition error", event.error);
        displayMessage(`Speech error: ${event.error === 'no-speech' ? 'No speech detected.' : event.error}`, 'error-subtle');
        stopSpeechRecognition();
    };
    recognition.onend = () => {
        stopSpeechRecognition(); // Ensure UI updates if recognition stops unexpectedly
    };
} else {
    console.warn("Speech Recognition API not supported.");
    if (voiceInputToggleButton) voiceInputToggleButton.disabled = true;
    if (languageSelect) languageSelect.disabled = true;
}

function startSpeechRecognition() {
    if (recognition && !isRecognizingSpeech) {
        try {
            recognition.lang = languageSelect.value;
            recognition.start();
            isRecognizingSpeech = true;
            if (voiceInputToggleButton) voiceInputToggleButton.classList.add('recording');
        } catch (e) {
            console.error("Error starting speech recognition:", e);
            displayMessage("Could not start voice input.", "error-subtle");
            stopSpeechRecognition(); // Reset state
        }
    }
}

function stopSpeechRecognition() {
    if (recognition && isRecognizingSpeech) {
        recognition.stop();
    }
    // This part should always run to ensure UI is reset, even if recognition.stop() was called or it ended naturally.
    isRecognizingSpeech = false;
    if (voiceInputToggleButton) voiceInputToggleButton.classList.remove('recording');
}

// --- Speech Synthesis ---
function speakText(text: string, lang: string) {
    if (!('speechSynthesis' in window)) {
        displayMessage("Text-to-speech not supported in this browser.", "error-subtle");
        return;
    }

    if (speechSynthesis.speaking && text === currentSpokenText) {
        speechSynthesis.cancel();
        currentSpokenText = null;
        return;
    }

    speechSynthesis.cancel(); // Cancel any previous utterance before speaking a new one or stopping

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    const voices = speechSynthesis.getVoices();
    const selectedVoice = voices.find(voice => voice.lang === lang) || voices.find(voice => voice.lang.startsWith(lang.split('-')[0]));
    if (selectedVoice) {
        utterance.voice = selectedVoice;
    }

    currentSpokenText = text;
    utterance.onend = () => {
        currentSpokenText = null;
    };
    utterance.onerror = () => {
        currentSpokenText = null; // Clear on error too
        displayMessage("Error occurred during text-to-speech.", "error-subtle");
    };

    speechSynthesis.speak(utterance);
}

// --- Chat Functions ---
function initializeChat(mode: string, customInstructionText?: string) {
    if (!ai) return;

    let instructionContent: Content | undefined;

    if (customInstructionText) {
        instructionContent = { parts: [{ text: customInstructionText }] };
        currentCustomInstruction = customInstructionText; // Store for potential non-chat uses
    } else if (systemInstructions[mode]) {
        instructionContent = systemInstructions[mode];
        currentCustomInstruction = null;
    } else {
        // Fallback to Normal if mode is somehow unknown (e.g. custom mode deleted but still selected)
        instructionContent = systemInstructions['Normal'];
        currentCustomInstruction = null;
        console.warn(`Unknown mode "${mode}", falling back to Normal.`);
    }
    
    const config: any = { model: GEMINI_TEXT_MODEL };
    if (instructionContent) {
        config.systemInstruction = instructionContent;
    }


    if (mode === 'News') { // News mode uses one-off generateContent for search grounding
        currentChat = null;
    } else {
         currentChat = ai.chats.create(config);
    }
}

function displayMessage(message: string, sender: 'user' | 'ai' | 'error' | 'error-subtle' | 'info', imageUrl?: string, groundingChunks?: any[]) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', `${sender}-message`);

    const textElement = document.createElement('p');
    // Basic Markdown-like formatting for bold and italics
    let formattedMessage = message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'); // Bold
    formattedMessage = formattedMessage.replace(/\*(.*?)\*/g, '<em>$1</em>');     // Italics
    // Handle code blocks (very basic for now)
    formattedMessage = formattedMessage.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    textElement.innerHTML = formattedMessage;
    messageElement.appendChild(textElement);

    if (imageUrl) {
        const imgElement = document.createElement('img');
        imgElement.src = imageUrl;
        imgElement.alt = sender === 'ai' ? "GuroAI generated image" : "User uploaded image";
        imgElement.classList.add('message-image');
        messageElement.appendChild(imgElement);
    }

    if (groundingChunks && groundingChunks.length > 0) {
        const sourcesTitle = document.createElement('p');
        sourcesTitle.textContent = "Sources:";
        sourcesTitle.style.fontWeight = "bold";
        sourcesTitle.style.marginTop = "10px";
        messageElement.appendChild(sourcesTitle);

        const sourcesList = document.createElement('ul');
        sourcesList.classList.add('sources-list');
        groundingChunks.forEach(chunk => {
            if (chunk.web && chunk.web.uri) {
                const listItem = document.createElement('li');
                const link = document.createElement('a');
                link.href = chunk.web.uri;
                link.textContent = chunk.web.title || chunk.web.uri;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                listItem.appendChild(link);
                sourcesList.appendChild(listItem);
            }
        });
        messageElement.appendChild(sourcesList);
    }

    messageElement.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).tagName === 'A' || (e.target as HTMLElement).closest('a')) {
            return;
        }
        // Use the actual text content for speech, not HTML
        const textToSpeak = messageElement.querySelector('p')?.textContent || message;
        const lang = (sender === 'user' && languageSelect.value) ? languageSelect.value : (document.documentElement.lang || 'en-US');
        speakText(textToSpeak, lang);
        if (imageUrl) speakText("Image displayed.", lang); // Announce image separately if clicked and image exists
    });

    if (messagesContainer) {
      messagesContainer.appendChild(messageElement);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

async function sendMessage() {
    if (!ai) {
        displayMessage("AI is not initialized. Please check API Key.", "error");
        return;
    }
    const promptText = chatInput.value.trim();
    if (!promptText && !uploadedImageBase64 && !uploadedPdfFile) return;

    setLoading(true);

    const currentPrompt = promptText || (uploadedImageBase64 ? "Analyze this image" : (uploadedPdfFile ? `Regarding the file: ${uploadedPdfFile.name}`: "..." ));
    displayMessage(currentPrompt, 'user', uploadedImageBase64 || undefined);
    chatInput.value = '';
    autoAdjustTextareaHeight(chatInput);


    const parts: Part[] = [];
    if (promptText) {
        parts.push({ text: promptText });
    }
    if (uploadedImageBase64 && uploadedImageMimeType) {
        parts.push({
            inlineData: { data: uploadedImageBase64, mimeType: uploadedImageMimeType },
        });
    }
    if (uploadedPdfFile) {
        parts.push({ text: `User uploaded a PDF named "${uploadedPdfFile.name}". You cannot read PDF content directly. Remind the user that for PDF content analysis, they need to manually extract and paste the relevant text.` });
        // Display this info message only once when PDF is part of the prompt
        displayMessage(`Note: GuroAI cannot directly read PDF files. If you want analysis of its content, please copy and paste relevant text from "${uploadedPdfFile.name}".`, 'info');
    }

    clearFilePreviews();

    let aiResponseText = '';
    let aiMessageElement: HTMLDivElement | null = null;
    let aiTextContentElement: HTMLParagraphElement | null = null;

    const createAiMessageElements = () => {
        if (!aiMessageElement) {
            aiMessageElement = document.createElement('div');
            aiMessageElement.classList.add('message', 'ai-message');
            aiTextContentElement = document.createElement('p');
            aiMessageElement.appendChild(aiTextContentElement);
            messagesContainer.appendChild(aiMessageElement);
            aiMessageElement.addEventListener('click', (e) => {
                if ((e.target as HTMLElement).tagName === 'A' || (e.target as HTMLElement).closest('a')) return;
                const lang = document.documentElement.lang || 'en-US';
                // Ensure aiResponseText is the final accumulated text for speaking.
                // For streaming, this might need to be the fully accumulated text once done.
                // For now, it uses the current text content.
                speakText(aiTextContentElement?.textContent || aiResponseText, lang);
            });
        }
    };

    try {
        const effectiveSystemInstruction = currentCustomInstruction ? { parts: [{ text: currentCustomInstruction }] } : systemInstructions[currentMode];

        if (currentMode === 'News') {
            const newsPrompt = parts.length > 0 ? parts : [{ text: "What's the latest news?" }];
            const requestPayload: any = {
                model: GEMINI_TEXT_MODEL,
                contents: [{ parts: newsPrompt }],
                config: {
                    tools: [{ googleSearch: {} }],
                },
            };
             if(effectiveSystemInstruction) { // Add system instruction for News mode too
                 requestPayload.config.systemInstruction = effectiveSystemInstruction;
            }

            const response: GenerateContentResponse = await ai.models.generateContent(requestPayload);
            const text = response.text;
            const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

            createAiMessageElements();
            if(aiTextContentElement) aiTextContentElement.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>'); // Basic markdown
            aiResponseText = text; // Store full response for potential re-speak

            if (groundingMetadata?.groundingChunks && groundingMetadata.groundingChunks.length > 0 && aiMessageElement) {
                const sourcesTitle = document.createElement('p');
                sourcesTitle.textContent = "Sources:";
                sourcesTitle.style.fontWeight = "bold";
                sourcesTitle.style.marginTop = "10px";
                aiMessageElement.appendChild(sourcesTitle);
                const sourcesList = document.createElement('ul');
                sourcesList.classList.add('sources-list');
                groundingMetadata.groundingChunks.forEach(chunk => {
                    if (chunk.web && chunk.web.uri) { 
                        const listItem = document.createElement('li');
                        const link = document.createElement('a');
                        link.href = chunk.web.uri;
                        link.textContent = chunk.web.title || chunk.web.uri;
                        link.target = "_blank";
                        link.rel = "noopener noreferrer";
                        listItem.appendChild(link);
                        sourcesList.appendChild(listItem);
                    }
                });
                aiMessageElement.appendChild(sourcesList);
            }

            try {
                if (text && text.length > 20) { // Generate image only if there's substantial text
                    const imageGenResponse = await ai.models.generateImages({
                        model: IMAGEN_MODEL,
                        prompt: `A news headline image related to: ${text.substring(0, 150)}`, // Limit prompt length
                        config: { numberOfImages: 1, outputMimeType: 'image/jpeg' },
                    });
                    if (imageGenResponse.generatedImages && imageGenResponse.generatedImages[0]?.image?.imageBytes && aiMessageElement) {
                        const base64ImageBytes = imageGenResponse.generatedImages[0].image.imageBytes;
                        const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;
                        const imgElement = document.createElement('img');
                        imgElement.src = imageUrl;
                        imgElement.alt = "GuroAI generated news image";
                        imgElement.classList.add('message-image');
                        aiMessageElement.appendChild(imgElement);
                    }
                }
            } catch (imgError) {
                console.error("Image generation error for News mode:", imgError);
            }

        } else if (currentChat) {
            const stream = await currentChat.sendMessageStream({ message: parts });
            createAiMessageElements();
            for await (const chunk of stream) {
                aiResponseText += chunk.text; // Accumulate text
                 if(aiTextContentElement) aiTextContentElement.innerHTML = aiResponseText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
                if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        } else {
             // Fallback if currentChat is null for non-News modes (should ideally re-initialize)
             const fallbackResponse = await ai.models.generateContent({
                model: GEMINI_TEXT_MODEL,
                contents: [{ parts: parts }],
                config: effectiveSystemInstruction ? { systemInstruction: effectiveSystemInstruction } : undefined
             });
             aiResponseText = fallbackResponse.text;
             createAiMessageElements();
             if(aiTextContentElement) aiTextContentElement.innerHTML = aiResponseText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        }

    } catch (error) {
        console.error("AI Error:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred with the AI.";
        displayMessage(`GuroAI Error: ${errorMessage}`, 'error');
        if (aiMessageElement && aiTextContentElement && !aiTextContentElement.textContent) {
            aiMessageElement.remove(); // Remove empty AI message bubble on error
        }
    } finally {
        setLoading(false);
        if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// --- UI Event Handlers ---
if (sendButton) sendButton.addEventListener('click', sendMessage);

if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    chatInput.addEventListener('input', () => autoAdjustTextareaHeight(chatInput));
}

function autoAdjustTextareaHeight(element: HTMLTextAreaElement) {
    element.style.height = 'auto';
    const newHeight = Math.max(element.scrollHeight, 48); // 48px is min-height from CSS
    element.style.height = `${newHeight}px`;
    const maxHeight = parseInt(getComputedStyle(element).maxHeight, 10) || 150; // Default 150px
    if (newHeight > maxHeight) {
        element.style.height = `${maxHeight}px`;
        element.style.overflowY = 'auto';
    } else {
        element.style.overflowY = 'hidden';
    }
}

if (modeSelect) {
    modeSelect.addEventListener('change', (e) => {
        const selectedOption = (e.target as HTMLSelectElement).selectedOptions[0];
        currentMode = selectedOption.value;
        const customInstruction = selectedOption.dataset.instruction;

        clearChatMessages();
        initializeChat(currentMode, customInstruction); // Pass custom instruction if available
        displayMessage(`Switched to ${currentMode} mode.`, 'info');
    });
}

// Theme and Accent Color Management
function applyTheme(theme: string) {
    document.body.dataset.theme = theme;
    localStorage.setItem(LOCAL_STORAGE_THEME_KEY, theme);
    if (themeToggleButton) themeToggleButton.textContent = theme === 'light-theme' ? '🌑' : '🌓';
}

function applyAccentColor(color: string) {
    // Fallback if a removed color (like pink) was stored
    const validColors = ['red', 'green', 'blue', 'purple', 'orange', 'yellow'];
    const effectiveColor = validColors.includes(color) ? color : 'red';

    document.body.dataset.accentColor = effectiveColor;
    localStorage.setItem(LOCAL_STORAGE_ACCENT_KEY, effectiveColor);
    if (colorPicker) {
        const buttons = colorPicker.querySelectorAll<HTMLButtonElement>('.color-option');
        buttons.forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.color === effectiveColor);
        });
    }
}

if (themeToggleButton) {
    themeToggleButton.addEventListener('click', () => {
        const newTheme = document.body.dataset.theme === 'light-theme' ? 'dark-theme' : 'light-theme';
        applyTheme(newTheme);
    });
}

if (colorPicker) {
    colorPicker.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        if (target.classList.contains('color-option') && target.dataset.color) {
            applyAccentColor(target.dataset.color);
        }
    });
}

if (fullscreenToggleButton) {
    fullscreenToggleButton.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
                displayMessage(`Fullscreen error: ${err.message}`, "error-subtle");
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    });
}
document.addEventListener('fullscreenchange', () => {
    if (fullscreenToggleButton) {
      fullscreenToggleButton.textContent = document.fullscreenElement ? '↘↙' : '⛶';
    }
});

if (clearChatButton) {
    clearChatButton.addEventListener('click', () => {
        clearChatMessages();
        const selectedOption = modeSelect.selectedOptions[0];
        initializeChat(currentMode, selectedOption.dataset.instruction);
        displayMessage("Chat cleared.", 'info');
    });
}

if (voiceInputToggleButton) {
    voiceInputToggleButton.addEventListener('click', () => {
        if (!recognition) {
            displayMessage("Speech recognition is not available.", "error-subtle");
            return;
        }
        if (isRecognizingSpeech) {
            stopSpeechRecognition();
        } else {
            startSpeechRecognition();
        }
    });
}
if (languageSelect) {
    languageSelect.addEventListener('change', () => {
        if (recognition && !isRecognizingSpeech) {
            recognition.lang = languageSelect.value;
        }
    });
}

if (imageUpload) {
    imageUpload.addEventListener('change', (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (file) {
            clearFilePreviews(true, false);
            const reader = new FileReader();
            reader.onload = (e) => {
                uploadedImageBase64 = (e.target?.result as string).split(',')[1];
                uploadedImageMimeType = file.type;
                if (imagePreview) imagePreview.src = e.target?.result as string;
                if (imagePreviewContainer) imagePreviewContainer.style.display = 'flex';
            };
            reader.readAsDataURL(file);
        }
    });
}

if (pdfUpload) {
    pdfUpload.addEventListener('change', (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (file) {
            clearFilePreviews(false, true);
            uploadedPdfFile = file;
            if (pdfPreviewName) pdfPreviewName.textContent = file.name;
            if (pdfPreviewContainer) pdfPreviewContainer.style.display = 'flex';
            if (pdfInfo) pdfInfo.style.display = 'inline';
        }
    });
}

if (removeImagePreviewButton) removeImagePreviewButton.addEventListener('click', () => clearFilePreviews(true, false));
if (removePdfPreviewButton) removePdfPreviewButton.addEventListener('click', () => clearFilePreviews(false, true));


// --- Custom Mode Functions ---
function loadCustomModes() {
    const storedModes = localStorage.getItem(LOCAL_STORAGE_CUSTOM_MODES_KEY);
    if (storedModes) {
        customModes = JSON.parse(storedModes);
    }
    populateModeSelect();
    renderCustomModesList();
}

function saveCustomModes() {
    localStorage.setItem(LOCAL_STORAGE_CUSTOM_MODES_KEY, JSON.stringify(customModes));
    populateModeSelect();
    renderCustomModesList();
}

function populateModeSelect() {
    if (!modeSelect) return;
    const currentValue = modeSelect.value;
    // Clear existing custom options only
    Array.from(modeSelect.options).forEach(option => {
        if (option.dataset.isCustom === 'true') {
            modeSelect.removeChild(option);
        }
    });

    let customModesGroup = modeSelect.querySelector<HTMLOptGroupElement>('optgroup[label="Custom Modes"]');
    if (!customModesGroup && customModes.length > 0) {
        customModesGroup = document.createElement('optgroup');
        customModesGroup.label = "Custom Modes";
        modeSelect.appendChild(customModesGroup);
    } else if (customModesGroup && customModes.length === 0) {
        modeSelect.removeChild(customModesGroup); // Remove group if no custom modes
    }


    customModes.forEach(mode => {
        const option = document.createElement('option');
        option.value = mode.name;
        option.textContent = mode.name;
        option.dataset.isCustom = 'true';
        option.dataset.instruction = mode.instruction;
        if (customModesGroup) {
            customModesGroup.appendChild(option);
        } else { // Should not happen if group is created above, but as fallback
            modeSelect.appendChild(option);
        }
    });
    // Try to restore previous selection
    if (Array.from(modeSelect.options).some(opt => opt.value === currentValue && opt.value !== "BadGuro")) { // Ensure BadGuro isn't re-selected if it was removed
        modeSelect.value = currentValue;
    } else if (customModes.length > 0) {
         // If previous was deleted, select first custom or default to Normal
        modeSelect.value = customModes[0].name;
    } else {
        modeSelect.value = "Normal"; // Default to Normal if no custom modes and previous was BadGuro
    }
     // Trigger change to re-initialize chat if current selection changed due to deletion
    const event = new Event('change');
    modeSelect.dispatchEvent(event);
}

function renderCustomModesList() {
    if (!customModesListElement) return; 
    customModesListElement.innerHTML = ''; 
    if (customModes.length === 0) {
        if (noCustomModesLi) {
            noCustomModesLi.style.display = 'block';
        } else {
            const tempNoModesLi = document.createElement('li');
            tempNoModesLi.className = 'no-custom-modes';
            tempNoModesLi.textContent = "You haven't created any custom modes yet.";
            tempNoModesLi.style.fontStyle = "italic";
            tempNoModesLi.style.textAlign = "center";
            tempNoModesLi.style.padding = "10px";
            customModesListElement.appendChild(tempNoModesLi);
        }
        return;
    }
    if (noCustomModesLi) noCustomModesLi.style.display = 'none';

    customModes.forEach((mode, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="mode-name">${mode.name}</span>
            <div class="mode-actions">
                <button data-index="${index}" class="edit-custom-mode" aria-label="Edit ${mode.name}">Edit</button>
                <button data-index="${index}" class="delete-custom-mode" aria-label="Delete ${mode.name}">Delete</button>
            </div>
        `;
        customModesListElement.appendChild(li);
    });
}

function openCustomModeModal(indexToEdit: number = -1) {
    if (!customModeModal || !editingModeIndexInput || !customModeFormTitle || !customModeNameInput || 
        !customModeInstructionInput || !customModeForm || !saveCustomModeButton || !cancelEditCustomModeButton) {
        console.warn("Custom mode modal elements not found, cannot open modal.");
        return;
    }

    editingModeIndex = indexToEdit;
    editingModeIndexInput.value = String(indexToEdit);

    if (indexToEdit > -1 && customModes[indexToEdit]) {
        const mode = customModes[indexToEdit];
        customModeFormTitle.textContent = 'Edit Custom Mode';
        customModeNameInput.value = mode.name;
        customModeInstructionInput.value = mode.instruction;
        saveCustomModeButton.textContent = 'Update Mode';
        cancelEditCustomModeButton.style.display = 'inline-block';
    } else {
        customModeFormTitle.textContent = 'Create New Mode';
        customModeForm.reset();
        saveCustomModeButton.textContent = 'Save Mode';
        cancelEditCustomModeButton.style.display = 'none';
    }
    customModeModal.classList.add('open');
    customModeNameInput.focus();
}

function closeCustomModeModal() {
    if (!customModeModal || !customModeForm || !editingModeIndexInput || !saveCustomModeButton || !cancelEditCustomModeButton) {
         console.warn("Custom mode modal elements not found, cannot close/reset modal.");
        return;
    }
    customModeModal.classList.remove('open');
    customModeForm.reset();
    editingModeIndex = -1;
    editingModeIndexInput.value = "-1";
    saveCustomModeButton.textContent = 'Save Mode';
    cancelEditCustomModeButton.style.display = 'none';
}

// Check if manageModesButton exists before adding event listener
if (manageModesButton) {
    manageModesButton.addEventListener('click', () => openCustomModeModal());
}

if (customModeModalCloseButton) {
    customModeModalCloseButton.addEventListener('click', closeCustomModeModal);
}

const modalOverlay = customModeModal?.querySelector('.modal-overlay');
if (modalOverlay) {
    modalOverlay.addEventListener('click', closeCustomModeModal);
}


if (customModeForm) {
    customModeForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!customModeNameInput || !customModeInstructionInput || !editingModeIndexInput) return;

        const name = customModeNameInput.value.trim();
        const instruction = customModeInstructionInput.value.trim();
        const currentIndex = parseInt(editingModeIndexInput.value, 10);

        if (!name || !instruction) {
            displayMessage("Mode name and instruction cannot be empty.", "error-subtle");
            return;
        }
        if (customModes.some((mode, idx) => mode.name.toLowerCase() === name.toLowerCase() && idx !== currentIndex)) {
            displayMessage(`A custom mode named "${name}" already exists. Please choose a unique name.`, "error-subtle");
            return;
        }


        if (currentIndex > -1) { 
            customModes[currentIndex] = { name, instruction };
        } else { 
            customModes.push({ name, instruction });
        }
        saveCustomModes();
        closeCustomModeModal();
        displayMessage(currentIndex > -1 ? `Mode "${name}" updated.` : `Mode "${name}" created.`, "info");
    });
}

if (cancelEditCustomModeButton) {
    cancelEditCustomModeButton.addEventListener('click', () => {
        if (!customModeFormTitle || !customModeForm || !editingModeIndexInput || !saveCustomModeButton || !cancelEditCustomModeButton || !customModeNameInput) return;
        customModeFormTitle.textContent = 'Create New Mode';
        customModeForm.reset();
        editingModeIndex = -1;
        editingModeIndexInput.value = "-1";
        saveCustomModeButton.textContent = 'Save Mode';
        cancelEditCustomModeButton.style.display = 'none';
        customModeNameInput.focus();
    });
}

if (customModesListElement) {
    customModesListElement.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const editButton = target.closest('.edit-custom-mode') as HTMLButtonElement;
        const deleteButton = target.closest('.delete-custom-mode') as HTMLButtonElement;

        if (editButton && editButton.dataset.index) {
            openCustomModeModal(parseInt(editButton.dataset.index, 10));
        } else if (deleteButton && deleteButton.dataset.index) {
            const indexToDelete = parseInt(deleteButton.dataset.index, 10);
            if (confirm(`Are you sure you want to delete the mode "${customModes[indexToDelete].name}"?`)) {
                const deletedModeName = customModes[indexToDelete].name;
                customModes.splice(indexToDelete, 1);
                saveCustomModes();
                displayMessage(`Mode "${deletedModeName}" deleted.`, "info");
            }
        }
    });
}


// --- Helper Functions ---
function clearFilePreviews(clearImage = true, clearPdf = true) {
    if (clearImage) {
        uploadedImageBase64 = null;
        uploadedImageMimeType = null;
        if (imagePreview) imagePreview.src = '#';
        if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
        if (imageUpload) imageUpload.value = '';
    }
    if (clearPdf) {
        uploadedPdfFile = null;
        if (pdfPreviewName) pdfPreviewName.textContent = '';
        if (pdfPreviewContainer) pdfPreviewContainer.style.display = 'none';
        if (pdfUpload) pdfUpload.value = '';
        if (pdfInfo) pdfInfo.style.display = uploadedPdfFile ? 'inline' : 'none';
    }
}

function clearChatMessages() {
    if (messagesContainer) messagesContainer.innerHTML = '';
}

function setLoading(isLoading: boolean) {
    if (loadingIndicator) {
        loadingIndicator.style.display = isLoading ? 'flex' : 'none';
        if (isLoading) {
            const loadingSpan = loadingIndicator.querySelector('span');
            if (loadingSpan) loadingSpan.textContent = 'GuroAI is thinking...';
        }
    }
    if (chatInput) chatInput.disabled = isLoading;
    if (sendButton) sendButton.disabled = isLoading;
    if (voiceInputToggleButton) voiceInputToggleButton.disabled = isLoading;
    if (modeSelect) modeSelect.disabled = isLoading;
    if (imageUpload) imageUpload.disabled = isLoading;
    if (pdfUpload) pdfUpload.disabled = isLoading;
    if (colorPicker) colorPicker.style.pointerEvents = isLoading ? 'none' : 'auto';
    const manageModesBtn = document.getElementById('manage-modes-button') as HTMLButtonElement | null;
    if (manageModesBtn) manageModesBtn.disabled = isLoading;
}

// --- Initial Setup ---
const preferredTheme = localStorage.getItem(LOCAL_STORAGE_THEME_KEY) ||
                       (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark-theme' : 'light-theme');
applyTheme(preferredTheme);

const storedAccent = localStorage.getItem(LOCAL_STORAGE_ACCENT_KEY);
const validAccents = ['red', 'green', 'blue', 'purple', 'orange', 'yellow'];
let preferredAccent = 'red'; // Default
if (storedAccent && validAccents.includes(storedAccent)) {
    preferredAccent = storedAccent;
}
applyAccentColor(preferredAccent);


loadCustomModes(); 
if (modeSelect && modeSelect.selectedOptions && modeSelect.selectedOptions.length > 0) {
    let initialMode = modeSelect.value;
    let initialInstruction = modeSelect.selectedOptions[0].dataset.instruction;

    // If BadGuro was selected but is now removed, default to "Normal"
    if (initialMode === "BadGuro" && !systemInstructions["BadGuro"]) {
        initialMode = "Normal";
        initialInstruction = undefined; // Normal mode uses its default instruction
        modeSelect.value = "Normal"; // Update the select element
    } else {
        const storedMode = localStorage.getItem('guroai-last-mode');
        if (storedMode) {
            const optionExists = Array.from(modeSelect.options).find(opt => opt.value === storedMode);
            if (optionExists && optionExists.value !== "BadGuro") { // Ensure it's not the removed BadGuro
                modeSelect.value = storedMode;
                initialMode = storedMode;
                initialInstruction = optionExists.dataset.instruction;
            } else if (optionExists && optionExists.value === "BadGuro") {
                 modeSelect.value = "Normal"; // Fallback if BadGuro was stored
                 initialMode = "Normal";
                 initialInstruction = undefined;
            }
        }
    }
    localStorage.setItem('guroai-last-mode', initialMode); // Store the potentially updated mode
    initializeChat(initialMode, initialInstruction);
} else if (modeSelect) {
    initializeChat(modeSelect.value); 
     localStorage.setItem('guroai-last-mode', modeSelect.value);
} else {
    initializeChat("Normal");
     localStorage.setItem('guroai-last-mode', 'Normal');
}

modeSelect.addEventListener('change', (e) => {
    // Existing event listener logic...
    // Add this line to store the newly selected mode
    localStorage.setItem('guroai-last-mode', (e.target as HTMLSelectElement).value);
});


displayMessage("Welcome to GuroAI! I'm here to help. Select a mode or ask me anything.", 'info');
if(chatInput) autoAdjustTextareaHeight(chatInput);

if (!API_KEY && !process.env.API_KEY) { 
    console.error("API_KEY is not set.");
    displayMessage(
        "Configuration Error: The API_KEY for GuroAI is not set. Please ensure the API_KEY is configured for the AI to function.",
        "error"
    );
}
const inputAreaElement = document.getElementById('input-area');
if (inputAreaElement) {
    document.documentElement.style.setProperty('--input-area-height', `${inputAreaElement.offsetHeight}px`);
}