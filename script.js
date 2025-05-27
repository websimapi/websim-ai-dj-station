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
        li.textContent = `${track.title || track.fileName || 'Unknown Title'} - ${track.artist || 'Unknown Artist'} (${track.genre || 'N/A'})`;
        li.dataset.sourceValue = track.sourceValue; // If it's a file, this is tricky for direct reload. For now, mainly for URL.
        li.dataset.source = track.source;
        li.dataset.title = track.title;
        li.dataset.artist = track.artist;
        li.dataset.genre = track.genre;
        li.dataset.fileName = track.fileName;
        
        li.addEventListener('click', () => {
            // Attempt to reload. File reload is complex without storing the actual file.
            // For now, this will mostly work for URLs.
            // If it's a file, it's more of a display of past activity.
            // We can re-populate fields but can't auto-load the file itself from localStorage.
            if (track.source === 'url' && track.sourceValue) {
                musicUrlInput.value = track.sourceValue;
                loadAudioFromUrl(track.sourceValue);
            } else {
                // For files, we just repopulate the info. The user would need to re-select the file.
                currentTrackInfo = { ...track };
                updateTrackDisplay();
                playerControls.style.display = 'block';
                audioPlayer.src = ''; // Clear previous audio to prevent playing old track
                aiText.textContent = "Track info loaded from history. Please re-select file if you want to play it.";
                dropZoneFileName.textContent = track.fileName || 'File from history';
                speakButton.style.display = 'none';
            }
        });
        historyList.appendChild(li);
    });
}


async function parseMetadata(fileOrUrl) {
    try {
        let metadata;
        if (fileOrUrl instanceof File) {
            metadata = await mmb.parseBlob(fileOrUrl);
        } else if (typeof fileOrUrl === 'string') { // Assuming URL
            // music-metadata-browser typically needs a fetch response or blob.
            // For URLs, we can fetch it first, then parse.
            // However, for direct audio src, browser handles streaming.
            // Let's simplify: for URL, we'll use it directly for audio src.
            // Metadata extraction from remote URL is more complex and might hit CORS.
            // So, for URLs, we'll rely on user input for genre and derive title from URL.
             return {
                title: fileOrUrl.substring(fileOrUrl.lastIndexOf('/') + 1) || 'Unknown Title',
                artist: 'Unknown Artist',
                genre: '', // User will input
                duration: 0 // Will get from audio element
            };
        }

        return {
            title: metadata.common.title || fileOrUrl.name || 'Unknown Title',
            artist: metadata.common.artist || 'Unknown Artist',
            genre: metadata.common.genre ? metadata.common.genre.join(', ') : '',
            duration: metadata.format.duration || 0
        };
    } catch (error) {
        console.error('Error parsing metadata:', error);
        const fallbackName = (fileOrUrl instanceof File) ? fileOrUrl.name : fileOrUrl.substring(fileOrUrl.lastIndexOf('/') + 1);
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
        sourceValue: file.name, // Store file name as identifier for history (not the file itself)
        fileName: file.name
    };
    
    const objectURL = URL.createObjectURL(file);
    audioPlayer.src = objectURL;
    // audioPlayer.onloadedmetadata = () => { // No need to revoke, handled by browser
    //     currentTrackInfo.duration = audioPlayer.duration;
    // };
    playerControls.style.display = 'block';
    updateTrackDisplay();
    saveToLocalStorage(currentTrackInfo);
}

async function loadAudioFromUrl(url) {
    if (!url) {
        alert('Please enter a valid URL.');
        return;
    }
    // For URLs, metadata parsing is tricky due to CORS. We'll use basic info.
    const metadata = await parseMetadata(url); // This will give a basic title.
    currentTrackInfo = {
        ...metadata,
        source: 'url',
        sourceValue: url,
        fileName: url.substring(url.lastIndexOf('/') + 1) || 'URL Track'
    };

    audioPlayer.src = url;
    // audioPlayer.onloadedmetadata = () => { // No need to revoke, handled by browser
    //     currentTrackInfo.duration = audioPlayer.duration;
    // };
    playerControls.style.display = 'block';
    updateTrackDisplay();
    saveToLocalStorage(currentTrackInfo);
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
        dropZoneFileName.textContent = `Selected: ${file.name}`;
        loadAudioFromFile(file);
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

