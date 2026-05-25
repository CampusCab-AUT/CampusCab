import React, { useState, useEffect, useRef } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { collection, doc, onSnapshot, query, orderBy, addDoc, updateDoc, serverTimestamp, getDoc, deleteField, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { FIRESTORE_COLLECTIONS } from '../firestoreModel';

const AGORA_APP_ID = "0b376da546bc438894aeb03c8de6c912";

// Custom Hook to manage Agora RTC Audio
function useVoiceCall(appId, channelName, isMuted, onVolumeUpdate) {
  const [micDenied, setMicDenied] = useState(false);
  const localTrackRef = useRef(null);

  useEffect(() => {
    let client;
    let animationFrameId;
    let mounted = true;

    const startCall = async () => {
      try {
        client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

        client.on("user-published", async (user, mediaType) => {
          await client.subscribe(user, mediaType);
          if (mediaType === "audio" && mounted) {
            user.audioTrack?.play();
          }
        });

        await client.join(appId, channelName, null, null);

        const localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        if (!mounted) {
          localAudioTrack.stop();
          localAudioTrack.close();
          client.leave();
          return;
        }
        
        localTrackRef.current = localAudioTrack;
        localAudioTrack.setEnabled(!isMuted); // apply initial mute state
        await client.publish([localAudioTrack]);
        setMicDenied(false);

        const updateBars = () => {
          if (!mounted || !localAudioTrack) return;
          const vol = localAudioTrack.getVolumeLevel(); // 0 - 100
          
          const activeLevel = localAudioTrack.muted ? 0 : vol;
          const scaled = Math.max(10, activeLevel * 0.8);
          
          const newBars = [
            Math.max(10, scaled * (0.6 + Math.random() * 0.4)),
            Math.max(10, scaled * (0.8 + Math.random() * 0.4)),
            Math.max(10, scaled * (1.0 + Math.random() * 0.2)),
            Math.max(10, scaled * (0.8 + Math.random() * 0.4)),
            Math.max(10, scaled * (0.6 + Math.random() * 0.4)),
          ];
          onVolumeUpdate(newBars);
          animationFrameId = requestAnimationFrame(updateBars);
        };
        updateBars();

      } catch (err) {
        console.error("Agora Error: ", err);
        setMicDenied(true);
      }
    };

    if (appId && appId !== "PASTE_YOUR_AGORA_APP_ID_HERE") {
      startCall();
    } else {
      console.warn("Agora APP ID is missing. Audio call will not work until you paste your key.");
    }

    return () => {
      mounted = false;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (localTrackRef.current) {
        localTrackRef.current.stop();
        localTrackRef.current.close();
        localTrackRef.current = null;
      }
      if (client) {
        client.removeAllListeners();
        client.leave();
      }
    };
  }, [appId, channelName]);

  useEffect(() => {
    if (localTrackRef.current) {
      localTrackRef.current.setEnabled(!isMuted);
    }
  }, [isMuted]);

  return { micDenied };
}

const QUICK_REPLIES = [
  "I'm at the pickup spot",
  "Be right there",
  "Okay, thanks!",
  "Where are you?"
];

const EMOJI_REACTIONS = ['👍', '👋', '❤️'];

const WORLD_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'Arabic' },
  { code: 'bn', name: 'Bengali' },
  { code: 'zh', name: 'Chinese' },
  { code: 'cs', name: 'Czech' },
  { code: 'da', name: 'Danish' },
  { code: 'nl', name: 'Dutch' },
  { code: 'fil', name: 'Filipino' },
  { code: 'fi', name: 'Finnish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'el', name: 'Greek' },
  { code: 'he', name: 'Hebrew' },
  { code: 'hi', name: 'Hindi' },
  { code: 'hu', name: 'Hungarian' },
  { code: 'id', name: 'Indonesian' },
  { code: 'it', name: 'Italian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ms', name: 'Malay' },
  { code: 'no', name: 'Norwegian' },
  { code: 'fa', name: 'Persian' },
  { code: 'pl', name: 'Polish' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ro', name: 'Romanian' },
  { code: 'ru', name: 'Russian' },
  { code: 'es', name: 'Spanish' },
  { code: 'sw', name: 'Swahili' },
  { code: 'sv', name: 'Swedish' },
  { code: 'th', name: 'Thai' },
  { code: 'tr', name: 'Turkish' },
  { code: 'uk', name: 'Ukrainian' },
  { code: 'ur', name: 'Urdu' },
  { code: 'vi', name: 'Vietnamese' }
];

function ChatWindow({ rideRequest, currentUser, onClose }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [translatedMessages, setTranslatedMessages] = useState({});
  const [reactionMenuId, setReactionMenuId] = useState(null);
  const [myAppLanguage, setMyAppLanguage] = useState('en');
  const [driverVehicle, setDriverVehicle] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [showCallModal, setShowCallModal] = useState(false);
  const [audioBars, setAudioBars] = useState([10, 10, 10, 10, 10]);
  const [micDenied, setMicDenied] = useState(false);
  const [callData, setCallData] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const chatId = rideRequest.id;
  const isPassenger = currentUser.uid === rideRequest.passengerId;

  // Clear translations when app language changes to prevent stale cached translations
  useEffect(() => {
    setTranslatedMessages({});
  }, [myAppLanguage]);

  // Subscribe to messages and handle "mark as read" logic
  useEffect(() => {
    if (!db || !currentUser) return;
    const messagesRef = collection(db, FIRESTORE_COLLECTIONS.chats, chatId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedMsgs = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

      setMessages(fetchedMsgs);
      setLoading(false);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

      // ACTION: Mark unread messages from the other user as "read"
      fetchedMsgs.forEach(msg => {
        if (msg.senderId !== currentUser.uid && msg.status !== 'read') {
          const msgRef = doc(db, FIRESTORE_COLLECTIONS.chats, chatId, 'messages', msg.id);
          updateDoc(msgRef, { status: 'read' }).catch(err => console.error("Failed to mark as read:", err));
        }
      });
    });

    return () => unsubscribe();
  }, [chatId, currentUser]);

  // Fetch driver's real vehicle directly from the vehicles collection
  useEffect(() => {
    if (!isPassenger) return;

    const fetchVehicle = async () => {
      const dId = rideRequest.driverId || rideRequest.trip?.driverId;
      if (!dId) return;
      try {
        const vSnap = await getDoc(doc(db, FIRESTORE_COLLECTIONS.vehicles, dId));
        if (vSnap.exists()) {
          setDriverVehicle(vSnap.data());
        }
      } catch (err) {
        console.error("Failed to fetch driver vehicle data:", err);
      }
    };

    fetchVehicle();
  }, [rideRequest, currentUser]);

  // Real-Time Call Listener
  useEffect(() => {
    if (!db || !chatId) return;
    const callRef = doc(db, FIRESTORE_COLLECTIONS.calls, chatId);
    const unsubscribe = onSnapshot(callRef, (snapshot) => {
      if (snapshot.exists()) {
        setCallData(snapshot.data());
      } else {
        setCallData(null);
      }
    });
    return () => unsubscribe();
  }, [chatId]);

  const logMissedCall = async (callerId) => {
    try {
      const messagesRef = collection(db, FIRESTORE_COLLECTIONS.chats, chatId, 'messages');
      await addDoc(messagesRef, {
        text: "Missed voice call",
        senderId: callerId,
        createdAt: serverTimestamp(),
        type: "system_missed_call"
      });
    } catch (err) {
      console.error("Failed to log missed call", err);
    }
  };

  // Use the custom Agora Voice hook
  const { micDenied: agoraMicDenied } = useVoiceCall(
    callData?.status === 'connected' ? AGORA_APP_ID : null,
    chatId,
    isMuted,
    setAudioBars
  );

  useEffect(() => {
    if (callData?.status === 'connected') {
      setMicDenied(agoraMicDenied);
    }
  }, [agoraMicDenied, callData?.status]);

  // Call audio tones (dial tone for caller, ringtone for receiver)
  useEffect(() => {
    if (callData?.status !== 'ringing') return;

    let audioCtx;
    let toneInterval;
    let mounted = true;

    const isCaller = callData?.callerId === currentUser.uid;

    const playDialTone = () => {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      const playBeep = () => {
        if (!mounted || !audioCtx || audioCtx.state === 'closed') return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 440;
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 1.2);
      };

      playBeep();
      toneInterval = setInterval(playBeep, 3500);
    };

    const playRingtone = () => {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      const playRing = () => {
        if (!mounted || !audioCtx || audioCtx.state === 'closed') return;

        // Two-burst ring pattern: ring-ring, pause, ring-ring
        [0, 0.2].forEach(offset => {
          const osc1 = audioCtx.createOscillator();
          const osc2 = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc1.type = 'sine';
          osc2.type = 'sine';
          osc1.frequency.value = 440;
          osc2.frequency.value = 480;
          gain.gain.setValueAtTime(0.25, audioCtx.currentTime + offset);
          gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + offset + 0.4);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(audioCtx.destination);
          osc1.start(audioCtx.currentTime + offset);
          osc1.stop(audioCtx.currentTime + offset + 0.4);
          osc2.start(audioCtx.currentTime + offset);
          osc2.stop(audioCtx.currentTime + offset + 0.4);
        });
      };

      playRing();
      toneInterval = setInterval(playRing, 2500);
    };

    if (isCaller) {
      playDialTone();
    } else {
      playRingtone();
    }

    return () => {
      mounted = false;
      clearInterval(toneInterval);
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close();
      }
    };
  }, [callData?.status, callData?.callerId, currentUser.uid]);

  useEffect(() => {
    let interval;
    let ringingTimeout;

    // Caller timeout logic: if it rings for 30s, end it and log a missed call.
    if (callData?.status === 'ringing' && callData?.callerId === currentUser.uid) {
      ringingTimeout = setTimeout(() => {
        const endIt = async () => {
          try {
            const callRef = doc(db, FIRESTORE_COLLECTIONS.calls, chatId);
            await updateDoc(callRef, { status: 'ended' });
            await logMissedCall(currentUser.uid);
          } catch (e) {
            console.error(e);
          }
        };
        endIt();
      }, 30000);
    }

    if (callData?.status === 'connected') {
      setCallDuration(0);
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    
    return () => {
      clearInterval(interval);
      clearTimeout(ringingTimeout);
    };
  }, [callData?.status, callData?.callerId, currentUser.uid, chatId]);

  const initiateCall = async (e) => {
    if (e) e.preventDefault();
    try {
      setShowCallModal(false);
      const receiverId = isPassenger ? (rideRequest.trip?.driverId || rideRequest.driverId) : rideRequest.passengerId;
      if (!receiverId) return alert("Error: Could not identify receiver ID.");
      
      const collName = FIRESTORE_COLLECTIONS.calls || 'calls';
      const callRef = doc(db, collName, chatId);
      await setDoc(callRef, {
        callerId: currentUser.uid,
        receiverId,
        status: 'ringing',
        startTime: serverTimestamp()
      });
    } catch (err) {
      console.error("Failed to initiate call", err);
      alert("Failed to initiate call: " + err.message);
    }
  };

  const answerCall = async () => {
    try {
      const callRef = doc(db, FIRESTORE_COLLECTIONS.calls, chatId);
      await updateDoc(callRef, { status: 'connected' });
    } catch (err) {
      console.error("Failed to answer call", err);
    }
  };

  const endCall = async () => {
    try {
      if (callData?.status === 'ringing') {
        await logMissedCall(callData.callerId);
      }
      const callRef = doc(db, FIRESTORE_COLLECTIONS.calls, chatId);
      await updateDoc(callRef, { status: 'ended' });
    } catch (err) {
      console.error("Failed to end call", err);
    }
  };

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const sendTextToFirebase = async (text) => {
    if (!text.trim() || !currentUser) return;
    try {
      const messagesRef = collection(db, FIRESTORE_COLLECTIONS.chats, chatId, 'messages');
      await addDoc(messagesRef, {
        text: text.trim(),
        senderId: currentUser.uid,
        senderName: currentUser.displayName || currentUser.email || 'User',
        createdAt: serverTimestamp(),
        status: 'delivered', // Initialize as delivered since it hits the server
        language: myAppLanguage // Uses the app's overall language profile
      });
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message.');
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedImage(file);
    setImagePreviewUrl(URL.createObjectURL(file));
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  const clearSelectedImage = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setSelectedImage(null);
    setImagePreviewUrl(null);
  };

  const handleSendImage = async () => {
    if (!selectedImage || !currentUser || isUploading) return;
    setIsUploading(true);
    try {
      const timestamp = Date.now();
      const safeName = selectedImage.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `chat_images/${chatId}/${timestamp}_${safeName}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, selectedImage);
      const downloadUrl = await getDownloadURL(storageRef);

      const messagesRef = collection(db, FIRESTORE_COLLECTIONS.chats, chatId, 'messages');
      await addDoc(messagesRef, {
        text: 'Sent a photo',
        imageUrl: downloadUrl,
        senderId: currentUser.uid,
        senderName: currentUser.displayName || currentUser.email || 'User',
        type: 'image',
        createdAt: serverTimestamp(),
        status: 'delivered'
      });
      clearSelectedImage();
    } catch (err) {
      console.error('Failed to upload image:', err);
      alert('Failed to send image: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (selectedImage) {
      await handleSendImage();
      return;
    }
    const txt = newMessage;
    setNewMessage('');
    await sendTextToFirebase(txt);
  };

  const handleQuickReply = async (text) => {
    await sendTextToFirebase(text);
  };

  const handleTTS = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    } else {
      alert("Text-to-speech is not supported in your browser.");
    }
  };

  const handleSpeechToText = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please try using Google Chrome or Microsoft Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = myAppLanguage === 'en' ? 'en-US' : myAppLanguage; // Uses your app language
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsRecording(true);
    };

    recognition.onresult = (event) => {
      const speechResult = event.results[0][0].transcript;
      setNewMessage((prev) => (prev ? prev + ' ' + speechResult : speechResult));
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
  };

  const handleTranslateToggle = async (msgId, originalText) => {
    const currentData = translatedMessages[msgId] || { isTranslated: false, text: null };
    
    // Turn off translation
    if (currentData.isTranslated) {
      setTranslatedMessages(prev => ({
        ...prev,
        [msgId]: { ...prev[msgId], isTranslated: false }
      }));
      return;
    }

    // Turn ON (use cached)
    if (currentData.text) {
      setTranslatedMessages(prev => ({
        ...prev,
        [msgId]: { isTranslated: true, text: currentData.text }
      }));
      return;
    }

    // Fetch live translation to current app language
    try {
      // Set temporary loading text
      setTranslatedMessages(prev => ({
        ...prev,
        [msgId]: { isTranslated: true, text: "Translating..." }
      }));
      
      const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(originalText)}&langpair=autodetect|${myAppLanguage}`);
      const data = await res.json();
      const translated = data?.responseData?.translatedText;
      
      // Handle case where text is already in the target language (API throws 403 or returns this specific string)
      if (data.responseStatus === 403 || (translated && translated.includes("PLEASE SELECT TWO DISTINCT"))) {
        setTranslatedMessages(prev => ({
          ...prev,
          [msgId]: { isTranslated: false, text: null, isSameLanguage: true }
        }));
        return;
      }

      if (translated) {
        setTranslatedMessages(prev => ({
          ...prev,
          [msgId]: { isTranslated: true, text: translated }
        }));
      } else {
        setTranslatedMessages(prev => ({
          ...prev,
          [msgId]: { isTranslated: true, text: "[Translation Failed]" }
        }));
      }
    } catch (err) {
      console.error(err);
      setTranslatedMessages(prev => ({
        ...prev,
        [msgId]: { isTranslated: true, text: "[Translation Error]" }
      }));
    }
  };

  const handleReaction = async (msgId, emoji, currentReaction) => {
    setReactionMenuId(null);
    try {
      // Don't try to update our local mock messages in Firestore
      if (msgId.startsWith('mock')) {
        alert("Reactions on mock messages are not saved to the database.");
        return;
      }
      const newEmoji = emoji === currentReaction ? deleteField() : emoji;
      const msgRef = doc(db, FIRESTORE_COLLECTIONS.chats, chatId, 'messages', msgId);
      await updateDoc(msgRef, { reaction: newEmoji });
    } catch (error) {
      console.error('Error reacting to message:', error);
    }
  };

  const chatPartnerName = isPassenger ? (rideRequest.trip?.driverName || 'Driver') : (rideRequest.passengerName || 'Passenger');
  const v = driverVehicle || rideRequest.trip?.vehicle;
  const vehicleInfo = v ? `${v.make} ${v.model} • ${v.licensePlate || 'ZXC123'}` : 'Toyota RAV4 • ZXC123';

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(5px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '20px', zIndex: 1000
    }} onClick={() => setReactionMenuId(null)}>
      
      {/* Dynamic App Settings for Testing Two-Way Translation */}
      <div style={{
        marginBottom: '12px', padding: '8px 16px', backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem',
        color: '#0f172a', fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
      }} onClick={(e) => e.stopPropagation()}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          📱 My App Profile Language:
          <select
            value={myAppLanguage}
            onChange={(e) => setMyAppLanguage(e.target.value)}
            style={{
              border: 'none', backgroundColor: 'transparent', outline: 'none',
              fontSize: '0.85rem', color: '#3b82f6', cursor: 'pointer', fontWeight: 700
            }}
          >
            {WORLD_LANGUAGES.map(lang => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{
        width: '100%', maxWidth: '480px', height: '100%', maxHeight: '850px',
        backgroundColor: '#ffffff', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative'
      }} onClick={(e) => {
        e.stopPropagation();
        setReactionMenuId(null); // Closes reaction menu when clicking anywhere else in the chat
      }}>
        {/* Header - Uber Style */}
        <div style={{
          padding: '16px', backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', gap: '16px', position: 'sticky', top: 0, zIndex: 10
        }}>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', fontSize: '1.4rem', color: '#000000',
            cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '50%'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            ←
          </button>
          
          <div style={{
            width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#e2e8f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem'
          }}>
            👤
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#000000', margin: 0 }}>
              {chatPartnerName}
            </h2>
            {isPassenger && (
              <span style={{ fontSize: '0.85rem', color: '#475569' }}>
                {vehicleInfo}
              </span>
            )}
          </div>
          
          <button 
            onClick={() => setShowCallModal(true)}
            style={{
              background: '#f1f5f9', border: 'none', borderRadius: '50%',
              width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.2rem', cursor: 'pointer', transition: 'background-color 0.2s',
              color: '#0f172a'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
            title={`Call ${chatPartnerName}`}
          >
            📞
          </button>
        </div>

        {/* Messages Area */}
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', color: '#64748b', marginTop: '40px', fontWeight: 500 }}>
              Loading messages...
            </div>
          ) : messages.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#94a3b8', margin: 'auto', maxWidth: '80%' }}>
              <div style={{ fontWeight: 500 }}>No messages yet. Say hi!</div>
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.senderId === currentUser.uid;
              const translationData = translatedMessages[msg.id] || {};
              const showTranslated = translationData.isTranslated;
              const displayText = showTranslated ? translationData.text : msg.text;
              const isSameLanguage = msg.language === myAppLanguage || translationData.isSameLanguage;
              const showReactionMenu = reactionMenuId === msg.id;

              if (msg.type === 'system_missed_call') {
                const timeStr = msg.createdAt?.seconds 
                  ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                  : 'Sending...';

                return (
                  <div key={msg.id} style={{
                    display: 'flex', flexDirection: 'column', margin: '12px 0', width: '100%',
                    alignItems: isMine ? 'flex-end' : 'flex-start'
                  }}>
                    <div style={{
                      backgroundColor: isMine ? '#000000' : '#ffffff',
                      border: isMine ? 'none' : '1px solid #e2e8f0',
                      color: isMine ? '#ffffff' : '#000000',
                      padding: '12px', borderRadius: '16px',
                      display: 'flex', flexDirection: 'column', gap: '12px',
                      minWidth: '220px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {/* Icon Container */}
                        <div style={{
                          width: '42px', height: '42px', borderRadius: '50%',
                          backgroundColor: isMine ? '#334155' : '#fef2f2',
                          color: isMine ? '#ffffff' : '#ef4444',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '1.2rem'
                        }}>
                          {isMine ? '↗' : '📵'}
                        </div>
                        {/* Text Column */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                            {isMine ? 'Voice call' : 'Missed voice call'}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: isMine ? '#94a3b8' : '#64748b', marginTop: '2px' }}>
                            {timeStr}
                          </span>
                        </div>
                      </div>
                      
                      {/* Action Button (Receiver Only) */}
                      {!isMine && (
                        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                          <button 
                            onClick={() => setShowCallModal(true)}
                            style={{
                              width: '100%', background: 'none', border: 'none',
                              color: '#3b82f6', fontWeight: 600, fontSize: '0.95rem',
                              cursor: 'pointer', padding: '4px', textAlign: 'center'
                            }}
                          >
                            Call back
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // Image message rendering
              if (msg.type === 'image' && msg.imageUrl) {
                const timeStr = msg.createdAt?.seconds
                  ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : 'Sending...';
                return (
                  <div key={msg.id} style={{
                    display: 'flex', flexDirection: 'column',
                    alignItems: isMine ? 'flex-end' : 'flex-start'
                  }}>
                    <div
                      onClick={() => setLightboxUrl(msg.imageUrl)}
                      style={{
                        maxWidth: '250px', cursor: 'pointer',
                        borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        overflow: 'hidden', backgroundColor: isMine ? '#000000' : '#f1f5f9',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)', padding: '4px'
                      }}
                    >
                      <img
                        src={msg.imageUrl}
                        alt="Shared photo"
                        style={{
                          width: '100%', display: 'block',
                          borderRadius: isMine ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                          objectFit: 'cover'
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', padding: '0 4px' }}>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 500 }}>
                        {timeStr}
                      </span>
                      {isMine && msg.status && (
                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'capitalize' }}>
                          · {msg.status}
                        </span>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: isMine ? 'flex-end' : 'flex-start',
                  position: 'relative'
                }}>
                  {/* Reaction Menu */}
                  {showReactionMenu && (
                    <div style={{
                      position: 'absolute', top: '-40px', zIndex: 20,
                      backgroundColor: '#ffffff', borderRadius: '24px', padding: '6px 10px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', gap: '8px',
                      border: '1px solid #e2e8f0'
                    }}>
                      {EMOJI_REACTIONS.map(emoji => (
                        <button key={emoji} onClick={(e) => {
                          e.stopPropagation();
                          handleReaction(msg.id, emoji, msg.reaction);
                        }} style={{
                          background: msg.reaction === emoji ? '#f1f5f9' : 'none', 
                          border: 'none', fontSize: '1.4rem', cursor: 'pointer',
                          transition: 'transform 0.2s', borderRadius: '50%', padding: '4px 8px'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
                        onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* TTS Icon for received messages */}
                    {!isMine && (
                      <button onClick={(e) => { e.stopPropagation(); handleTTS(msg.text); }} style={{
                        background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '4px',
                        color: '#64748b'
                      }} title="Read message aloud">
                        🔊
                      </button>
                    )}
                    
                    <div 
                      onClick={(e) => {
                        e.stopPropagation();
                        // Toggle reaction menu on/off when clicking the message bubble
                        setReactionMenuId(reactionMenuId === msg.id ? null : msg.id);
                      }}
                      style={{
                        maxWidth: '280px', padding: '12px 16px',
                        borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        backgroundColor: isMine ? '#000000' : '#f1f5f9',
                        color: isMine ? '#ffffff' : '#000000',
                        fontSize: '0.95rem', lineHeight: '1.4', wordBreak: 'break-word',
                        cursor: 'pointer', position: 'relative'
                      }}
                      title="Click to react"
                    >
                      {displayText}
                      {/* Display active reaction */}
                      {msg.reaction && (
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            // Clicking the small reaction directly removes it
                            handleReaction(msg.id, msg.reaction, msg.reaction);
                          }}
                          style={{
                            position: 'absolute', bottom: '-10px', [isMine ? 'left' : 'right']: '-10px',
                            backgroundColor: '#ffffff', borderRadius: '50%', padding: '2px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)', fontSize: '1.1rem',
                            border: '1px solid #e2e8f0', cursor: 'pointer'
                          }}
                          title="Click to remove reaction"
                        >
                          {msg.reaction}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: msg.reaction ? '14px' : '6px', padding: '0 4px' }}>
                    {/* CONDITIONAL TRANSLATION BUTTON */}
                    {!isMine && msg.language && !isSameLanguage && (
                      <span onClick={() => handleTranslateToggle(msg.id, msg.text)} style={{
                        fontSize: '0.7rem', color: '#3b82f6', cursor: 'pointer', fontWeight: 600
                      }}>
                        {showTranslated ? 'Show Original' : `Translate to ${WORLD_LANGUAGES.find(l => l.code === myAppLanguage)?.name || 'English'}`}
                      </span>
                    )}
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 500 }}>
                      {msg.createdAt?.seconds ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}
                    </span>
                    {/* Real Database Read Receipt */}
                    {isMine && msg.status && (
                      <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'capitalize' }}>
                        · {msg.status}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Replies & Input Footer */}
        <div style={{ backgroundColor: '#ffffff', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
          
          {/* Image Preview Bar */}
          {imagePreviewUrl && (
            <div style={{
              padding: '12px 16px 0', display: 'flex', alignItems: 'flex-start', gap: '8px'
            }}>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img
                  src={imagePreviewUrl}
                  alt="Preview"
                  style={{
                    width: '80px', height: '80px', objectFit: 'cover', borderRadius: '12px',
                    border: '2px solid #e2e8f0'
                  }}
                />
                <button
                  type="button"
                  onClick={clearSelectedImage}
                  style={{
                    position: 'absolute', top: '-6px', right: '-6px',
                    width: '22px', height: '22px', borderRadius: '50%',
                    backgroundColor: '#ef4444', color: '#ffffff', border: '2px solid #ffffff',
                    fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1, padding: 0
                  }}
                >
                  ✕
                </button>
              </div>
              {isUploading && (
                <span style={{ fontSize: '0.85rem', color: '#3b82f6', fontWeight: 600, alignSelf: 'center' }}>
                  Uploading…
                </span>
              )}
            </div>
          )}

          {/* Quick Replies Carousel */}
          <div style={{
            display: 'flex', overflowX: 'auto', gap: '8px', padding: '12px 16px 8px 16px',
            scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch'
          }}>
            {QUICK_REPLIES.map((reply, idx) => (
              <button key={idx} onClick={() => handleQuickReply(reply)} style={{
                whiteSpace: 'nowrap', padding: '8px 16px', backgroundColor: '#f1f5f9',
                border: '1px solid #e2e8f0', borderRadius: '20px', color: '#0f172a',
                fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
              >
                {reply}
              </button>
            ))}
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleImageSelect}
          />

          {/* Text Input Row */}
          <form onSubmit={handleSendMessage} style={{
            padding: '8px 16px 16px 16px', display: 'flex', gap: '12px', alignItems: 'center'
          }}>
            {/* Camera Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer',
                padding: '4px', color: '#64748b', display: 'flex', alignItems: 'center',
                justifyContent: 'center', transition: 'color 0.2s'
              }}
              onMouseOver={(e) => e.currentTarget.style.color = '#0f172a'}
              onMouseOut={(e) => e.currentTarget.style.color = '#64748b'}
              title="Send a photo"
            >
              📷
            </button>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', backgroundColor: '#f1f5f9',
              borderRadius: '24px', padding: '4px 16px', gap: '8px'
            }}>
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={isRecording ? "Listening..." : "Type a message..."}
                style={{
                  flex: 1, padding: '10px 0', border: 'none', backgroundColor: 'transparent',
                  fontSize: '0.95rem', color: isRecording ? '#3b82f6' : '#000000', outline: 'none',
                  fontWeight: isRecording ? 600 : 400
                }}
                disabled={isRecording}
              />
              <button 
                type="button" 
                onClick={handleSpeechToText} 
                disabled={isRecording}
                style={{
                  background: isRecording ? '#ef4444' : 'none',
                  border: 'none', fontSize: '1.1rem', cursor: isRecording ? 'not-allowed' : 'pointer', 
                  padding: '8px', borderRadius: '50%', color: isRecording ? '#ffffff' : '#000000',
                  transition: 'background-color 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }} 
                title={isRecording ? "Listening..." : "Dictate message"}
              >
                🎤
              </button>
            </div>
            <button type="submit" disabled={(!newMessage.trim() && !selectedImage) || isUploading} style={{
              background: (newMessage.trim() || selectedImage) ? '#000000' : '#e2e8f0',
              border: 'none', color: (newMessage.trim() || selectedImage) ? '#ffffff' : '#94a3b8',
              borderRadius: '50%', width: '40px', height: '40px', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              cursor: (newMessage.trim() || selectedImage) ? 'pointer' : 'not-allowed',
              transition: 'background-color 0.2s'
            }}>
              {selectedImage ? '⬆' : '➤'}
            </button>
          </form>

        </div>
        
        {/* Safety Call Modal */}
        {showCallModal && (
          <div style={{
            position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }} onClick={(e) => { e.stopPropagation(); setShowCallModal(false); }}>
            <div style={{
              backgroundColor: '#ffffff', padding: '24px', borderRadius: '16px', width: '80%', maxWidth: '320px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', gap: '16px'
            }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0f172a' }}>Contacting {chatPartnerName}</h3>
              <p style={{ margin: 0, color: '#475569', fontSize: '0.95rem', lineHeight: '1.4' }}>
                Connecting you via a secure, anonymized line...
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button 
                  onClick={() => setShowCallModal(false)}
                  style={{
                    padding: '8px 16px', border: 'none', background: '#f1f5f9', borderRadius: '8px',
                    color: '#475569', fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button 
                  onClick={initiateCall}
                  style={{
                    padding: '8px 16px', border: 'none', background: '#000000', borderRadius: '8px',
                    color: '#ffffff', fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  Call
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Incoming Call Screen (Mode B) */}
        {callData?.status === 'ringing' && callData?.receiverId === currentUser.uid && (
          <div style={{
            position: 'absolute', inset: 0, backgroundColor: '#1e293b', zIndex: 60,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
            padding: '40px 20px', color: '#ffffff'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginTop: '40px' }}>
              <div style={{
                width: '120px', height: '120px', borderRadius: '50%', backgroundColor: '#475569',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '4rem',
                boxShadow: '0 0 30px rgba(255,255,255,0.2)',
                animation: 'pulse 1.5s infinite'
              }}>
                👤
              </div>
              <h2 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 600 }}>{chatPartnerName}</h2>
              <p style={{ margin: 0, color: '#38bdf8', fontSize: '1.1rem' }}>Incoming Call...</p>
            </div>
            
            <div style={{ display: 'flex', gap: '40px', alignItems: 'center', marginBottom: '40px' }}>
              {/* Decline */}
              <button onClick={endCall} style={{
                width: '72px', height: '72px', borderRadius: '50%', border: 'none',
                backgroundColor: '#ef4444', color: '#ffffff',
                fontSize: '2rem', cursor: 'pointer', transition: 'transform 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)'
              }} onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                 onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                <div style={{ transform: 'rotate(135deg)', display: 'flex' }}>📞</div>
              </button>

              {/* Accept */}
              <button onClick={answerCall} style={{
                width: '72px', height: '72px', borderRadius: '50%', border: 'none',
                backgroundColor: '#22c55e', color: '#ffffff',
                fontSize: '2rem', cursor: 'pointer', transition: 'transform 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(34, 197, 94, 0.4)',
                animation: 'bounce 2s infinite'
              }} onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                 onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                📞
              </button>
            </div>
          </div>
        )}

        {/* Active/Outgoing Call UI Overlay (Mode A & C) */}
        {(callData?.status === 'connected' || (callData?.status === 'ringing' && callData?.callerId === currentUser.uid)) && (
          <div style={{
            position: 'absolute', inset: 0, backgroundColor: '#1e293b', zIndex: 60,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between',
            padding: '40px 20px', color: '#ffffff'
          }}>
            {/* Top: Avatar and Text */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginTop: '20px' }}>
              <div style={{
                width: '100px', height: '100px', borderRadius: '50%', backgroundColor: '#475569',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem',
                boxShadow: '0 0 20px rgba(255,255,255,0.1)',
                animation: callData.status === 'ringing' ? 'pulse 1.5s infinite' : 'none'
              }}>
                👤
              </div>
              <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>{chatPartnerName}</h2>
              <p style={{ 
                margin: 0, color: callData.status === 'ringing' ? '#94a3b8' : '#38bdf8', fontSize: '1rem'
              }}>
                {callData.status === 'ringing' ? 'Ringing...' : formatDuration(callDuration)}
              </p>

              {/* Audio Visualizer */}
              {callData.status === 'connected' && (
                <div style={{ display: 'flex', gap: '4px', height: '60px', alignItems: 'center', marginTop: '16px' }}>
                  {micDenied ? (
                    <span style={{ color: '#ef4444', fontSize: '0.9rem' }}>Microphone Access Denied 📵</span>
                  ) : (
                    audioBars.map((height, i) => (
                      <div key={i} style={{
                        width: '8px', height: `${height}px`, backgroundColor: '#38bdf8',
                        borderRadius: '4px', transition: 'height 0.1s ease'
                      }} />
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Bottom: Controls */}
            <div style={{ display: 'flex', gap: '24px', alignItems: 'center', marginBottom: '20px' }}>
              {/* Mute */}
              <button 
                onClick={() => callData.status === 'connected' && setIsMuted(!isMuted)} 
                disabled={callData.status === 'ringing'}
                style={{
                  width: '56px', height: '56px', borderRadius: '50%', border: 'none',
                  backgroundColor: isMuted ? '#ffffff' : '#334155',
                  color: isMuted ? '#1e293b' : '#ffffff',
                  fontSize: '1.4rem', cursor: callData.status === 'ringing' ? 'not-allowed' : 'pointer', 
                  transition: 'all 0.2s', opacity: callData.status === 'ringing' ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {isMuted ? '🔇' : '🎙️'}
              </button>
              
              {/* End Call */}
              <button onClick={endCall} style={{
                width: '72px', height: '72px', borderRadius: '50%', border: 'none',
                backgroundColor: '#ef4444', color: '#ffffff',
                fontSize: '2rem', cursor: 'pointer', transition: 'transform 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)'
              }} onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
                 onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                <div style={{ transform: 'rotate(135deg)', display: 'flex' }}>📞</div>
              </button>

              {/* Speaker */}
              <button 
                onClick={() => callData.status === 'connected' && setIsSpeaker(!isSpeaker)} 
                disabled={callData.status === 'ringing'}
                style={{
                  width: '56px', height: '56px', borderRadius: '50%', border: 'none',
                  backgroundColor: isSpeaker ? '#ffffff' : '#334155',
                  color: isSpeaker ? '#1e293b' : '#ffffff',
                  fontSize: '1.4rem', cursor: callData.status === 'ringing' ? 'not-allowed' : 'pointer', 
                  transition: 'all 0.2s', opacity: callData.status === 'ringing' ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {isSpeaker ? '🔊' : '🔉'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox Modal */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
          }}
        >
          <button
            onClick={() => setLightboxUrl(null)}
            style={{
              position: 'absolute', top: '20px', right: '20px',
              background: 'none', border: 'none', color: '#ffffff',
              fontSize: '2rem', cursor: 'pointer', lineHeight: 1
            }}
          >
            ✕
          </button>
          <img
            src={lightboxUrl}
            alt="Full size"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain',
              borderRadius: '8px', cursor: 'default'
          
            }}
          />
        </div>
      )}
    </div>
  );
}

export default ChatWindow;
