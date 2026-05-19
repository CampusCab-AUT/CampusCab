import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import { auth, db, storage, firebaseReady } from '../firebase';
import { FIRESTORE_COLLECTIONS } from '../firestoreModel';
import { colors, radius, spacing, typography, surfaces, buttons, inputs } from '../theme';

export default function UserProfilePanel() {
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState({ text: '', type: '' });
  const fileInputRef = useRef(null);

  useEffect(() => {
    async function loadProfile() {
      if (!firebaseReady || !db || !auth) {
        setFetching(false);
        return;
      }
      const user = auth.currentUser;
      if (user) {
        try {
          const userDocRef = doc(db, FIRESTORE_COLLECTIONS.users, user.uid);
          const userSnap = await getDoc(userDocRef);
          const data = userSnap.exists() ? userSnap.data() : {};
          setDisplayName(data.displayName || user.displayName || '');
          if (data.bio) setBio(data.bio);
          if (data.avatarUrl) setAvatarUrl(data.avatarUrl);
        } catch (error) {
          console.error("Error loading profile:", error);
        }
      }
      setFetching(false);
    }
    loadProfile();
  }, []);

  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        setMessage({ text: 'Image must be smaller than 5MB', type: 'error' });
        return;
      }
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
      setMessage({ text: '', type: '' });
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!firebaseReady || !db || !auth || !storage) {
      setMessage({ text: 'Demo mode: Profile not saved. Firebase not fully configured.', type: 'error' });
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setMessage({ text: 'You must be logged in to save your profile.', type: 'error' });
      return;
    }

    const trimmedName = displayName.trim();
    if (trimmedName.length < 2) {
      setMessage({ text: 'Please enter your full name (at least 2 characters).', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage({ text: '', type: '' });

    try {
      let finalAvatarUrl = avatarUrl;

      // Upload new avatar if selected
      if (avatarFile) {
        const fileExtension = avatarFile.name.split('.').pop();
        const avatarStorageRef = storageRef(storage, `avatars/${user.uid}.${fileExtension}`);

        await uploadBytes(avatarStorageRef, avatarFile);
        finalAvatarUrl = await getDownloadURL(avatarStorageRef);
        setAvatarUrl(finalAvatarUrl);
      }

      if (trimmedName !== (user.displayName || '')) {
        await updateProfile(user, { displayName: trimmedName });
      }

      // Save to Firestore
      const userDocRef = doc(db, FIRESTORE_COLLECTIONS.users, user.uid);
      await setDoc(userDocRef, {
        displayName: trimmedName,
        bio,
        avatarUrl: finalAvatarUrl,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      setMessage({ text: 'Profile updated successfully!', type: 'success' });
      setAvatarFile(null); // Reset file selection after successful upload
    } catch (error) {
      console.error("Error saving profile:", error);
      setMessage({ text: 'Failed to update profile: ' + error.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return <div style={{ padding: spacing.xl, textAlign: 'center', ...typography.body, color: colors.textSubtle }}>Loading profile...</div>;
  }

  const displayAvatar = avatarPreview || avatarUrl || 'https://ui-avatars.com/api/?name=User&background=random';

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: spacing.xl }}>
      <div style={{ textAlign: 'center', marginBottom: spacing.xl }}>
        <h2 style={{ ...typography.h1, marginBottom: spacing.xs }}>My Profile</h2>
        <p style={{ ...typography.body, color: colors.textSubtle }}>Add a photo and bio so other students feel comfortable traveling with you.</p>
      </div>

      <form onSubmit={handleSave} style={{ ...surfaces.card, padding: spacing.xl }}>
        
        {/* Avatar Upload Section */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: spacing.xl }}>
          <div 
            style={{ 
              width: '120px', 
              height: '120px', 
              borderRadius: '50%', 
              overflow: 'hidden',
              marginBottom: spacing.md,
              border: `4px solid white`,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              backgroundColor: colors.surfaceMuted,
              position: 'relative',
              cursor: 'pointer'
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <img 
              src={displayAvatar} 
              alt="Profile Avatar" 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              color: 'white',
              fontSize: '0.75rem',
              textAlign: 'center',
              padding: '4px 0',
              fontWeight: 600
            }}>
              EDIT
            </div>
          </div>
          
          <input 
            type="file" 
            accept="image/*" 
            ref={fileInputRef} 
            onChange={handleImageChange} 
            style={{ display: 'none' }} 
          />
          <span style={{ ...typography.small, color: colors.textSubtle }}>Click image to upload new photo (Max 5MB)</span>
        </div>

        {/* Name Section */}
        <div style={{ marginBottom: spacing.lg }}>
          <label htmlFor="displayName" style={{ ...inputs.label }}>Full Name</label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. Alex Taylor"
            autoComplete="name"
            maxLength={60}
            style={{ ...inputs.field }}
          />
          <div style={{ ...typography.small, color: colors.textSubtle, marginTop: '4px' }}>
            This is the name drivers and passengers will see.
          </div>
        </div>

        {/* Bio Section */}
        <div style={{ marginBottom: spacing.xl }}>
          <label htmlFor="bio" style={{ ...inputs.label }}>About Me</label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Hi, I'm an engineering student. I love music and usually travel to the City Campus on Tuesdays and Thursdays."
            rows={4}
            maxLength={200}
            style={{ ...inputs.field, resize: 'vertical' }}
          />
          <div style={{ textAlign: 'right', ...typography.small, color: colors.textSubtle, marginTop: '4px' }}>
            {bio.length} / 200
          </div>
        </div>

        {/* Status Message */}
        {message.text && (
          <div style={{ 
            marginBottom: spacing.lg, 
            padding: spacing.md, 
            borderRadius: radius.md, 
            ...typography.small,
            fontWeight: 600,
            backgroundColor: message.type === 'error' ? colors.dangerSoft : colors.successSoft,
            color: message.type === 'error' ? colors.danger : colors.success,
          }}>
            {message.text}
          </div>
        )}

        {/* Submit Button */}
        <button 
          type="submit" 
          disabled={loading}
          style={{ 
            ...buttons.primary, 
            width: '100%',
            opacity: loading ? 0.7 : 1,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Saving Profile...' : 'Save Profile'}
        </button>
      </form>
    </div>
  );
}
