import * as mmb from 'music-metadata-browser';

const musicUrlInput = document.getElementById('musicUrl');
const loadUrlBtn = document.getElementById('loadUrlBtn');
const dropZone = document.getElementById('dropZone');
const dropZoneFileName = document.getElementById('dropZoneFileName');
const fileInput = document.getElementById('fileInput');
const audioPlayer = document.getElementById('audioPlayer');
const playerControls = document.getElementById('playerControls');
const trackTitleDisplay = document.getElementById('trackTitle');
const trackArtistDisplay = document.getElementById('trackArtist');
const genreInput = document.getElementById('genreInput');
const aiDjButton = document.getElementById('aiDjButton');
const aiAvatar = document.getElementById('aiAvatar');
const aiText = document.getElementById('aiText');
const speakButton = document.getElementById('speakButton');
const historyList = document.getElementById('historyList');

const CORS_PROXY_URL = 'https://api.allorigins.win/raw?url='; // Selected CORS proxy

let currentTrackInfo = {
    title: '',
    artist: '',
    genre: '',
    duration: 0,
    source: '', // 'url' or 'file'
    sourceValue: '', // URL string or File object for re-parsing
    fileName: '' // Store filename for display
};
let conversationHistory = [];
let currentAiSpeechUrl = null;
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let speechAudioSource = null;

const MAX_HISTORY = 10; // Max items in LLM history and display history
const LOCAL_STORAGE_KEY = 'aiDjStationHistory';

function saveToLocalStorage(trackData) {
    let history = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || [];
    // Avoid duplicates by sourceValue if it's a file, or by URL
    const existingIndex = history.findIndex(item => 
        (item.sourceValue === trackData.sourceValue && item.source === 'file') || 
        (item.sourceValue === trackData.sourceValue && item.source === 'url')
    );
    if (existingIndex > -1) {
        history.splice(existingIndex, 1); // Remove old entry to re-add at top
    }

    history.unshift(trackData); // Add new track to the beginning
    if (history.length > MAX_HISTORY) {
        history = history.slice(0, MAX_HISTORY);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(history));
    updateHistoryDisplay();
}

function loadFromLocalStorage() {
    const history = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || [];
    return history;
}

function updateHistoryDisplay() {
    const history = loadFromLocalStorage();
    historyList.innerHTML = '';
    history.forEach(track => {
        const li = document.createElement('li');
        // Ensure fileName is used if title is not available from metadata
        const displayTitle = track.title || track.fileName || 'Unknown Title';
        const displayArtist = track.artist || 'Unknown Artist';
        const displayGenre = track.genre || 'N/A';
        li.textContent = `${displayTitle} - ${displayArtist} (${displayGenre})`;
        li.dataset.sourceValue = track.sourceValue; 
        li.dataset.source = track.source;
        li.dataset.title = track.title;
        li.dataset.artist = track.artist;
        li.dataset.genre = track.genre;
        li.dataset.fileName = track.fileName; // Keep fileName for potential re-identification
        
        li.addEventListener('click', () => {
            if (track.source === 'url' && track.sourceValue) {
                musicUrlInput.value = track.sourceValue; // Set original URL in input
                loadAudioFromUrl(track.sourceValue); // loadAudioFromUrl will handle proxying
            } else {
                // For files, we just repopulate the info.
                currentTrackInfo = { ...track }; // Load all stored info
                updateTrackDisplay();
                playerControls.style.display = 'block';
                audioPlayer.src = ''; 
                aiText.textContent = "Track info loaded from history. Please re-select file if you want to play it.";
                dropZoneFileName.textContent = track.fileName || 'File from history';
                speakButton.style.display = 'none';
            }
        });
        historyList.appendChild(li);
    });
    if (history.length === 0) {
        historyList.innerHTML = '<li>No tracks loaded yet. Get started!</li>';
    }
}

async function parseMetadata(fileOrUrl) {
    try {
        let metadata;
        if (fileOrUrl instanceof File) {
            metadata = await mmb.parseBlob(fileOrUrl);
        } else if (typeof fileOrUrl === 'string') { // Assuming URL
            const proxiedUrl = CORS_PROXY_URL + encodeURIComponent(fileOrUrl);
            console.log(`Fetching metadata from proxied URL: ${proxiedUrl}`);
            try {
                const response = await fetch(proxiedUrl);
                if (!response.ok) {
                    console.error(`Failed to fetch from proxy: ${response.status} ${response.statusText}`);
                    throw new Error(`Proxy fetch failed: ${response.status}`);
                }
                const blob = await response.blob();
                // Use the original URL for context if music-metadata-browser uses it
                metadata = await mmb.parseBlob(blob, { path: fileOrUrl, mimeType: blob.type });
            } catch (fetchError) {
                console.error('Error fetching or parsing URL metadata via proxy:', fetchError);
                // Fallback for proxied URL if fetch or parse fails
                return {
                    title: fileOrUrl.substring(fileOrUrl.lastIndexOf('/') + 1) || 'Unknown Title (URL)',
                    artist: 'Unknown Artist',
                    genre: '',
                    duration: 0
                };
            }
        } else {
             // Should not happen with current logic
            console.warn("parseMetadata called with unexpected type:", fileOrUrl);
            return { title: 'Unknown', artist: 'Unknown', genre: '', duration: 0 };
        }

        return {
            title: metadata.common.title || (fileOrUrl instanceof File ? fileOrUrl.name : fileOrUrl.substring(fileOrUrl.lastIndexOf('/') + 1)) || 'Unknown Title',
            artist: metadata.common.artist || 'Unknown Artist',
            genre: metadata.common.genre ? metadata.common.genre.join(', ') : '',
            duration: metadata.format.duration || 0
        };
    } catch (error) {
        console.error('Error parsing metadata:', error);
        const fallbackName = (fileOrUrl instanceof File) ? fileOrUrl.name : (typeof fileOrUrl === 'string' ? fileOrUrl.substring(fileOrUrl.lastIndexOf('/') + 1) : 'Unknown Source');
        return {
            title: fallbackName || 'Unknown Title',
            artist: 'Unknown Artist',
            genre: '',
            duration: 0
        };
    }
}

function updateTrackDisplay() {
    trackTitleDisplay.textContent = currentTrackInfo.title || 'No title';
    trackArtistDisplay.textContent = currentTrackInfo.artist || 'Unknown artist';
    genreInput.value = currentTrackInfo.genre || '';
    aiText.textContent = "Track loaded. Click 'Ask AI DJ' for commentary!";
    speakButton.style.display = 'none';
    currentAiSpeechUrl = null;
}

async function loadAudioFromFile(file) {
    const metadata = await parseMetadata(file);
    currentTrackInfo = {
        ...metadata,
        source: 'file',
        // sourceValue is filename for files, as the File object cannot be stringified for localStorage
        sourceValue: file.name, 
        fileName: file.name
    };
    
    const objectURL = URL.createObjectURL(file);
    audioPlayer.src = objectURL;
    playerControls.style.display = 'block';
    updateTrackDisplay();
    saveToLocalStorage(currentTrackInfo); // Save complete info
}

async function loadAudioFromUrl(url) {
    if (!url || !url.trim()) {
        alert('Please enter a valid URL.');
        musicUrlInput.value = ''; // Clear invalid input
        return;
    }
    const trimmedUrl = url.trim();
    console.log(`Loading audio from URL: ${trimmedUrl}`);
    aiText.textContent = 'Loading track from URL...'; // Indicate loading

    // Parse metadata first using the original URL (parseMetadata handles proxying for fetch)
    const metadata = await parseMetadata(trimmedUrl); 
    
    currentTrackInfo = {
        ...metadata, // metadata from parsing (could be fallback if proxy fails)
        source: 'url',
        sourceValue: trimmedUrl, // Store the original URL
        // Use metadata.title if available, otherwise fallback to URL part
        fileName: metadata.title && metadata.title !== 'Unknown Title (URL)' ? metadata.title : (trimmedUrl.substring(trimmedUrl.lastIndexOf('/') + 1) || 'URL Track')
    };
    
    const proxiedAudioSrc = CORS_PROXY_URL + encodeURIComponent(trimmedUrl);
    audioPlayer.src = proxiedAudioSrc;
    
    playerControls.style.display = 'block';
    updateTrackDisplay(); // Update with potentially richer metadata
    saveToLocalStorage(currentTrackInfo); // Save complete info
}

// Event Listeners
loadUrlBtn.addEventListener('click', () => {
    loadAudioFromUrl(musicUrlInput.value.trim());
});

musicUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loadAudioFromUrl(musicUrlInput.value.trim());
    }
});

dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('dragover');
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('audio/')) {
            fileInput.files = files; // Assign to hidden file input
            dropZoneFileName.textContent = `Selected: ${file.name}`;
            loadAudioFromFile(file);
        } else {
            alert('Please drop an audio file.');
            dropZoneFileName.textContent = 'Invalid file type.';
        }
    }
});

dropZone.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (event) => {
    const files = event.target.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('audio/')) { // Added check here too for consistency
            dropZoneFileName.textContent = `Selected: ${file.name}`;
            loadAudioFromFile(file);
        } else {
            alert('Please select an audio file.');
            dropZoneFileName.textContent = 'Invalid file type selected.';
            fileInput.value = ''; // Reset file input
        }
    }
});

audioPlayer.addEventListener('loadedmetadata', () => {
    currentTrackInfo.duration = audioPlayer.duration;
});

audioPlayer.addEventListener('ended', () => {
    aiText.textContent = "Track finished. Load another one or ask AI DJ for final thoughts!";
    speakButton.style.display = 'none';
});

aiDjButton.addEventListener('click', async () => {
    if (!currentTrackInfo.title && !currentTrackInfo.fileName) {
        aiText.textContent = 'Please load a track first!';
        return;
    }

    currentTrackInfo.genre = genreInput.value.trim() || currentTrackInfo.genre || 'Unknown'; // Update genre from input if changed
    
    aiText.textContent = 'AI DJ is thinking...';
    speakButton.style.display = 'none';
    currentAiSpeechUrl = null;

    const trackName = currentTrackInfo.title || currentTrackInfo.fileName;
    const artistName = currentTrackInfo.artist || 'Unknown Artist';
    const genre = currentTrackInfo.genre;
    const durationSeconds = currentTrackInfo.duration;
    const durationMinutes = Math.floor(durationSeconds / 60);
    const remainingSeconds = Math.floor(durationSeconds % 60);
    const durationFormatted = durationSeconds > 0 ? `${durationMinutes}m ${remainingSeconds}s` : 'N/A';

    const prompt = `You are a charismatic and knowledgeable AI DJ on a futuristic radio station.
A track just started or is being highlighted.
Track Name: "${trackName}"
Artist: "${artistName}"
Genre: "${genre}"
Duration: ${durationFormatted}

Generate a short, engaging, and positive DJ comment about this track. Sound like you're introducing it or hyping it up.
Keep it under 40 words. Be creative and fun!`;

    try {
        const userMessage = { role: "user", content: prompt };
        conversationHistory.push(userMessage);
        conversationHistory = conversationHistory.slice(-6); // Keep history short

        const completion = await websim.chat.completions.create({
            messages: [
                { role: "system", content: "You are a fun, slightly quirky AI radio DJ. Keep responses concise and enthusiastic." },
                ...conversationHistory
            ],
        });

        const response = completion.content;
        aiText.textContent = response;
        conversationHistory.push({ role: "assistant", content: response });

        // Generate speech for the AI's comment
        const ttsResult = await websim.textToSpeech({
            text: response,
            voice: "en-female" // Or pick another voice
        });
        currentAiSpeechUrl = ttsResult.url;
        speakButton.style.display = 'block';

    } catch (error) {
        console.error('Error with AI DJ:', error);
        aiText.textContent = 'Sorry, AI DJ is having a break. Try again later.';
    }
});

speakButton.addEventListener('click', async () => {
    if (currentAiSpeechUrl) {
        try {
            if (speechAudioSource) {
                speechAudioSource.stop(); // Stop previous speech if any
            }
            const response = await fetch(currentAiSpeechUrl);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            speechAudioSource = audioContext.createBufferSource();
            speechAudioSource.buffer = audioBuffer;
            speechAudioSource.connect(audioContext.destination);
            speechAudioSource.start(0);
        } catch(error) {
            console.error("Error playing speech:", error);
            alert("Could not play AI DJ's voice.");
        }
    }
});

// Initial load
updateHistoryDisplay();

// Simple welcome message if no history
if (loadFromLocalStorage().length === 0) {
    historyList.innerHTML = '<li>No tracks loaded yet. Get started!</li>';
}

console.log("AI DJ Station script loaded.");