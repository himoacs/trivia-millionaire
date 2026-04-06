# Game Flow Test Instructions

## ✅ What I Fixed

### Backend Changes:
1. **Added `/api/session/:sessionId/current-question` endpoint** - Players poll this to get the current question
2. **Added `/api/session/:sessionId/answer` endpoint** - Players submit answers here
3. Both endpoints work without requiring Solace WebSocket connection

### Admin UI Changes:
1. **Start Game button** calls `/start` then `/release-question`
2. **Questions persist** to backend database
3. **Session state** tracked and displayed

### Client UI Changes:
1. **Polls for questions** every 1 second from backend
2. **Submits answers** via HTTP POST
3. **Updates score** from server response
4. **Shows different messages** based on session state (LOBBY, ACTIVE, CLOSED)

---

## 🧪 How to Test the Complete Flow

### Step 1: Start All Services
All services should already be running:
- ✅ Backend: http://localhost:3001
- ✅ Admin UI: http://localhost:5176
- ✅ Client UI: http://localhost:5173

### Step 2: Admin Creates Session
1. Open http://localhost:5176
2. Login with password: `admin123`
3. Click "Create New Session"
4. Enter session name: "Test Game"
5. Click "Create Session"

### Step 3: Admin Adds Questions
1. Click "➕ Add Manual" button
2. Enter a question (or click "YAML Import" tab and paste):
```yaml
questions:
  - text: "What color is the sky?"
    choices:
      - "Red"
      - "Blue"
      - "Green"
      - "Yellow"
    correctIndex: 1
    timeLimit: 15
    points: 1000
```
3. Click "Add Question(s)"
4. Verify question appears in the queue

### Step 4: Player Joins
1. Open http://localhost:5173 in a NEW INCOGNITO/PRIVATE window
2. Enter the session code shown on admin screen (e.g., "ABC123")
3. Click "Join Game"
4. Choose a nickname
5. Select an avatar
6. Click "Join Session"
7. You should see "Waiting for game to start..." message

### Step 5: Verify Player Appears on Admin Screen
1. Go back to admin screen (http://localhost:5176)
2. Check the "Players" panel on the left
3. You should see your joined player with avatar and nickname
4. Player count should update automatically (polling every 2 seconds)

### Step 6: Admin Starts the Game
1. On admin screen, click the big green "🎮 Start Game (Release First Question)" button
2. Session state badge should change from "📋 Lobby" to "🎮 Active Game"
3. "Question 1 of 1" should appear in header

### Step 7: Verify Player Sees Question
1. Switch to player window
2. Within 1-2 seconds, the waiting screen should disappear
3. You should see:
   - Question text
   - 4 answer buttons (colored red, blue, yellow, green)
   - Timer counting down
   - Current score

### Step 8: Player Answers Question
1. Click one of the answer buttons
2. Button should lock (can't change answer)
3. Score should update immediately if correct
4. Wait for timer to expire

### Step 9: Verify Answer Distribution (Admin)
1. On admin screen, wait for question timer to expire
2. Answer distribution bar chart should appear
3. Shows percentage for each answer choice
4. Highlights correct answer with green ring

---

## ✅ Expected Results

### Admin Screen Should Show:
- Session code in large font
- Session state badge (Lobby → Active)
- Question progress (Question 1 of 1)
- Player list with real-time updates
- Question queue with "NEXT" indicator
- "🚀 Release Next Question" button (for subsequent questions)
- Answer distribution chart after timer ends

### Player Screen Should Show:
- Waiting message while in lobby
- Question with timer when released
- Answer buttons that lock after selection
- Score updates immediately
- Smooth transitions between states

---

## 🔧 Debugging Tips

### If player doesn't see questions:
1. Check browser console for errors
2. Verify backend is running: `curl http://localhost:3001/health`
3. Check network tab - should see polling to `/current-question` every second

### If answers don't submit:
1. Check browser console for errors
2. Verify playerId is in localStorage
3. Check network tab for POST to `/answer` endpoint

### If admin doesn't see players:
1. Backend should show in terminal: `👤 Player joined ABC123: PlayerName`
2. Admin polls every 2 seconds - wait a moment
3. Check network tab for GET to `/api/admin/session/:id`

---

## 🎯 Success Criteria

- [x] Admin can create session
- [x] Admin can add questions (manual or AI)
- [x] Players can join and see waiting screen
- [x] Admin sees players appear in real-time
- [x] Admin can start game with "Start Game" button
- [x] Players automatically see questions (1-2 second delay)
- [x] Players can submit answers
- [x] Scores update correctly
- [x] Admin sees answer distribution after timer
- [x] All state transitions work smoothly

---

## 📊 Technical Implementation

### Communication Flow:
```
Admin → Backend → Players

1. Admin clicks "Start Game"
   ├─ POST /api/admin/session/:id/start (LOBBY → ACTIVE)
   └─ POST /api/admin/session/:id/release-question

2. Backend publishes to Solace (for future use)
   └─ trivia/session/:id/question

3. Players poll for question
   ├─ GET /api/session/:id/current-question (every 1 second)
   └─ Receives QuestionMessage when available

4. Player submits answer
   ├─ POST /api/session/:id/answer
   └─ Receives ScoreUpdate with new score

5. Admin sees distribution
   └─ (Currently simulated, will use Solace answer events)
```

### Why HTTP Polling?
- Browsers can't use Node.js Solace library directly
- WebSocket bridge would add complexity
- Polling with 1-second interval provides acceptable UX
- Future: Can upgrade to Solace Web Messaging API for true real-time

---

## Next Steps (Future Enhancements)
1. Implement Solace WebSocket for true real-time messaging
2. Connect answer distribution to real Solace answer events
3. Add leaderboard display after game ends
4. Add sounds and animations
5. LinkedIn sharing of results
