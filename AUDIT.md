# QA Audit — "Who Said That?" Party Pack

Branch `qa-audit` (from `main` @ 1014197). Audit only: **no product code has been changed yet**. The fixes below wait on approval of the plan in [§8](#8-fix-plan-grouped-by-root-cause).

**Method**
- **Static review** of `client/src` and `server/`.
- **Runtime testing** against the local dev stack: Vite on :5173, Node/Socket.io on :3001, with no photo storage configured, so photos use the inline fallback.
- **Playwright** drove 1 host TV browser at 1280×800 and 3 player phone browsers at 360×740 (Alice, Bob, Carl), each in its own browser context.
- **Raw `socket.io-client` scripts** covered the cases the UI can't produce: bad payloads, double emits, server restart.

**Legend for bugs**
- ✔ reproduced at runtime.
- 📖 verified by reading the code, not run.

---

## Contents
1. [Plugin contract](#1-mini-game-plugin-contract)
2. [Game inventory](#2-game-inventory)
3. [App flow](#3-app-flow)
4. [Socket events](#4-socket-events)
5. [Shared UI components](#5-shared-ui-components)
6. [Consistency audit (canonical elements + matrix)](#6-consistency-audit)
7. [Functional test results + bug list](#7-functional-test-results)
8. [Fix plan](#8-fix-plan-grouped-by-root-cause)
9. [Open questions](#9-open-questions)

---

## 1. Mini-game plugin contract

**Summary:** the "declarative plugin system" exists, but only 2 of the 11 games use it, and only for their voting screen. Everything else is bespoke pages plus about 4,100 lines of `HostPage.jsx`.

### 1.1 What a game declares (client adapter)
A game registers an adapter object in `client/src/game-core/adapters/index.js:6-11`. The adapter implements four functions:

| Function | Returns | Notes |
|---|---|---|
| `selectHostFrame(state, ctx)` | HostFrame: `{roomCode, showQr, timer:{secondsLeft,paused,total}, progress:{current,total,label}, playerStatuses[], paused, prompt, roundLabel}` (`game-core/types/gameFrame.contract.js:1-10`), plus game extras such as ToT `a/b/pctA/resultsVisible` | |
| `createHostActions({socket, roomCode, state, ctx})` | `{togglePause, changeQuestion, skipMiniGame, nextRound?}` | Informal contract. ToT's `togglePause` always pauses and never resumes (`thisOrThat.adapter.js:49-54`) |
| `selectPlayerFrame(state, ctx)` | PlayerFrame: `{roundLabel, prompt, timer, choices[], joker, hasSubmitted, submittedChoice}` (`gameFrame.contract.js:12-20`) | |
| `createPlayerActions({socket, roomCode, dispatch, state, ctx})` | `{submitChoice, toggleJoker?}` | Emits the socket event and dispatches an optimistic `*_MARK_VOTED` |

There is **no manifest**: no single place declares a game's name, icon, route, start event, minimum player count or end route. That information is hard-coded and duplicated across `App.jsx`, `HostPage.jsx` (4 separate game lists with different labels and icons), `LobbyPage.jsx`, `GameSwitcher.jsx`, `config/hostControls.js`, `useSocket.js`, `rejoinState.js` and `usePhaseSync.js`.

### 1.2 What the framework provides
- **Client hooks and layouts**
  - Hooks: `useHostGameFrame` / `usePlayerGameFrame`, which look up the adapter.
  - Layouts: `HostGameLayout` (top bar, left rail, status bubbles, footer controls) and `PlayerGameLayout` (prompt header, `TimerRing`, action stage, confirm and joker slots).
  - `useVoteConfirmation`, a pending → confirmed state machine used only by ToT.
  - `useRoundTimerSync`, which nothing uses.
  - `createGameSlice`, a reducer factory that is only partly wired (`gameStore.jsx:47-56`).
- **Separate input lifecycle:** `useMiniGameLifecycle` + `components/MiniGameWrapper.jsx` handle Input → Confirm → Waiting/Edit. 8 legacy pages use them.
- **Server**
  - `templates/VotingGameTemplate.js`: phases, rounds, a `VoteCollector`, a timer, and `*:voting_started/results/end`. **Only MLT** uses it.
  - Helpers used by the bespoke handlers: `TimerManager`, `SubmissionTracker` and `VoteCollector`.
  - `miniGameSnapshot` (rejoin snapshots for 6 games) and `canonicalRoute` (the server's answer to "which screen should I be on?").

### 1.3 Who actually uses it

| Game | Client adapter/layout | Server template | Everything else |
|---|---|---|---|
| Most Likely To | ✅ voting screen only | ✅ | Results/end are legacy pages; TV results/end are bespoke panels |
| This or That | ✅ | ❌ (`totGame.js`) | End page legacy |
| WST, Situational, Mixed, Drawing, FITB, Selfie, Caption, Photo Vote (pmatch/photoassoc), Draw Telephone | ❌ | ❌ | Bespoke `pages/*` + `HostPage.jsx` panels + handlers in `server/index.js` / `server/game/dtGame.js` |
| Trivia | adapter + placeholder views, **unreachable** (no route, no server) | — | — |
| Drawing adapter | dead: reads `state.drawing` and emits events the server doesn't handle | — | — |

---

## 2. Game inventory

"Phases" lists the phases the game has. Shared = components from `components/` or `game-core/`.

| Game (id) | Player pages | Intro | Input | Waiting | Reveal / Results | End | Shared components used | Custom |
|---|---|---|---|---|---|---|---|---|
| Who Said That (`who-said-that`) | `QuestionPage`, `VotingPage`, `RoundEndPage`, `GameEndPage` | ❌ | text answer, then vote per answer | ✅ | ✅ author flip, round summary | ✅ | MiniGameWrapper, ConfirmVoteCard, VoteLocked, GameEndShell, TimerRing (TV + global overlay) | text timer, flip reveal, round-end summary |
| Situational (`situational`) | `QuestionPage`, `SituationalVotingPage` | ❌ | text answer about a target, vote best | ✅ | ✅ | `GameEndPage` | MiniGameWrapper, ConfirmVoteCard, VoteLocked, VoteCoin | text timer |
| Most Likely To (`most-likely-to`) | `games/most-likely-to/PlayerView`, `MostLikelyToResultsPage`, `MostLikelyToEndPage` | ❌ | vote a player (joker) | ✅ | ✅ best-in-class bars/coins/rank deltas | custom podium | PlayerGameLayout, TimerRing, ConfirmVoteCard, JokerButton, VoteCoin | LockedVoteCard, podium, looping confetti |
| This or That (`this-or-that`) | `games/this-or-that/PlayerView`, `ThisOrThatEndPage` | ❌ | pick A/B | ✅ | **❌ none on phones** | GameEndShell | PlayerGameLayout, TimerRing, useVoteConfirmation, ConfirmVoteCard | LockedTotCard |
| Fill in the Blank (`fill-in-the-blank`) | `FillBlankPage`, `FillBlankEndPage` | ❌ | text, then vote | ✅ dots | ✅ | GameEndShell | MiniGameWrapper, ConfirmVoteCard, VoteCoin | always-red text timer, no vote timer |
| Pictionary / Sketch It (`drawing`) | `DrawingPage`, `DrawingEndPage` | ❌ | draw, then vote | ✅ count | ✅ | GameEndShell | TimerRing, MiniGameWrapper, ConfirmVoteCard, ReplayCanvas | fullscreen canvas |
| Drawing in Chain (`draw-telephone`) | `DrawTel{Prompt,Draw,Wait,Guess,Reveal,End}Page` (+ `/selfie-photo`) | ⚠️ inline rules card | selfie, prompt, draw chain, guess | ✅ `DrawTelWaitPage` | ✅ 3-step reveal + vote | GameEndShell | MiniGameWrapper, TimerRing (draw), SelfieCapture, GameEndShell | text timers, reveal |
| Draw on Friends (`selfie-roast`) | `SelfiePhotoPage`, `SelfieDrawPage`, `SelfieVotePage`, `SelfieResultsPage` | ❌ | photo, draw on a friend, vote | ✅ | ⚠️ final-results page after every round | custom | SelfieCapture, MiniGameWrapper, TimerRing, ConfirmVoteCard | results page |
| Selfie Captions (`caption`) | `Caption{Photo,Write,Vote,Results}Page` | ❌ | photo, caption, vote | ✅ | ✅ | ❌ no TV end screen | SelfieCapture, MiniGameWrapper, ConfirmVoteCard | **no timer anywhere** |
| Selfie Challenge / Prompt Match (`pmatch` / `photoassoc`, server "photovote") | `PhotoVote{Photo,,Results}Page` | ❌ | photo, vote | ✅ | ✅ | ⚠️ phones stay on results | SelfieCapture, ConfirmVoteCard | **no timer anywhere** |
| Mixed (`mixed`) | WST/Sit/ToT/Drawing pages | ❌ | — | — | — | `GameEndPage` | — | scores split across games (P1-09) |

Dark/light mode: the whole app is **dark-only**, with hex colours hard-coded everywhere and no theme tokens. That is consistent, not broken, so it isn't scored per game.

---

## 3. App flow

```
/ (HomePage) ── "Host a New Game" ──▶ /host (HostPage, TV) ──create_room──▶ lobby (TV shows QR + code)
      │                                         │
      └─ name + 4-letter code ── join_room ─────┤  phones: /lobby (LobbyPage)
                                                │
TV: Start (needs ≥3 playing+connected) ─▶ game-specific start event (mlt:start, draw:start, … or start_game)
                                                │
                    ❌ no per-game intro ── phones jump straight to the first gameplay route
                                                │
gameplay: server events drive client navigate(); backstops: usePhaseSync (local) + useScreenSync (polls whats_my_screen every 7s)
                                                │
round results (per-game screen) ── host "Next Round" ──▶ … ──▶ game end screen (+ mergeToGlobalScores)
                                                │
playlist: TV-only state (HostPage + sessionStorage). "▶ Next: <game>" = change_game → 200 ms → <next>:start
                                                │
❌ no end-of-playlist scoreboard on the TV. Cumulative scores only show in the phone lobby.
```

Key facts:
- **Create room.** Rooms are created only from the TV. The TV socket *is* the host player (`playerName:'Screen Cast'`, `hostIsPlaying:false`). A TV refresh re-attaches with `join_spectator`, which does no authentication.
- **Join.** Phones join from `/`. A mid-game join is always allowed: the player is flagged `joinedMidRound` and parked on `/lobby` (see P1-08).
- **Playlist.** The playlist lives only in the TV tab's state and `sessionStorage`; the server has no concept of it. Advancing relies on the TV emitting `change_game` then the next start event, with a 200 ms `setTimeout` in between (`HostPage.jsx:3644-3685`).
- **Game end.** The server sets `room.phase` to `mltEnd`, `totEnd`, `drawEnd`, `fitbEnd`, `selfieEnd`, `dtEnd` or `gameEnd`. **Caption and Photo Vote never set an End phase** (see P1-07).

---

## 4. Socket events

Full table, one row per event: direction, payload, emitter file:line and handler file:line. `idx` = `server/index.js`, `dt` = `server/game/dtGame.js`, `Host` = `client/src/pages/HostPage.jsx` (it has its own socket), `useSocket` = `client/src/hooks/useSocket.js` (the on/off pairs are balanced at 480-864).

### 4.1 Room, lobby and system

| Event | Dir | Payload | Emitter | Handler |
|---|---|---|---|---|
| create_room | C→S | `{playerName, gameType, gameName, hostIsPlaying, selectedSubGames?, roundsPerSubGame?, roomConfig?}` | Host:3537 | idx:820 |
| room_created | S→C | `{code, playerId, players, gameType, gameName, selectedSubGames, isPlaying, roomConfig, globalScores}` | idx:836 | useSocket:54/503; Host:3549 |
| join_room | C→S | `{code, playerName, playerId}` | HomePage:43,46; useSocket:27 | idx:839 |
| join_success | S→C | `{room, playerId, isRejoin, uploadToken, miniGameState}` | idx:802, 858, 911 | useSocket:64/504 |
| player_joined | S→C | `{players}` | idx:873, 1177 | useSocket:78/505; Host:2859 |
| player_reconnected | S→C | `{playerId, playerName, players}` | idx:814 | useSocket:94/509 (Host: none) |
| player_disconnected | S→C | `{playerId, playerName}` | idx:1728 | useSocket:90/508 (Host: none) |
| host_changed | S→C | `{host}` | idx:1731 | useSocket:151/510 (Host: none) |
| whats_my_screen | C→S (ack) | `{code}`, ack(route\|null) | useScreenSync:47 | idx:885 |
| request_resync | C→S | `{code}` | useSocket:48; useScreenSync:55 | idx:903 |
| set_game_options | C→S | `{code, mode, totalRounds, gameType, mltRounds, allowSelfVote}` | LobbyPage:94 | idx:928 |
| options_updated | S→C | `{mode, totalRounds, customQuestions, gameType, selectedSubGames, mltTotalRounds, mltAllowSelfVote}` | idx:931 | useSocket:82/506; Host:2861 |
| add_custom_question | C→S | `{code, text, saveToBank}` | LobbyPage:107 | idx:945 |
| custom_questions_updated | S→C | `{customQuestions}` | idx:954 | useSocket:86/507 |
| kick_player | C→S | `{code, targetPlayerId}` | LobbyPage:202; Host:3638 | idx:1160 |
| kicked | S→C | none | idx:1181, 1185, 1189 | useSocket:161/524 |
| join_spectator | C→S | `{code}` | Host:3503, 3545 | idx:1528 |
| spectator_joined | S→C | `{room:{…per-game recovery…}}` | idx:1551 | Host:3330 |
| error | S→C | `{message}` | idx:876, 941, 1529, 1531 | useSocket:156/523 (alert); Host:3318 |
| change_game | C→S | `{code, newGameType}` | Host:3668, 3692, 3710, 3948, 4007; GameEndPage:18; ThisOrThatEndPage:20; GameSwitcher:27 | idx:2588 |
| game_changed | S→C | `{code, gameType, players, gameName}` | idx:1061, 1087, 2621 | useSocket:474/744; Host:3310 |
| skip_mini_game | C→S | `{code}` | Host:3634; mlt/tot/drawing/trivia adapters | idx:1049 |
| reset_global_scores | C→S | `{code}` | LobbyPage:152; Host:3947 | idx:2631 |
| remove_from_global_scores | C→S | `{code, playerId}` | LobbyPage:170 | idx:2640 |
| global_scores_updated | S→C | `{globalScores, leaderboard}` | idx:248, 2637, 2650 | useSocket:737/742 (Host: none) |
| phase_timer | S→C | `{secondsLeft, paused, phase?}` | TimerManager:40 (tickEvent `phase_timer`, from idx:278, 300, 446, 706, 717; dt:1318, 1356, 1985, 2031); idx:432, 458 | useSocket:740/743; Host:2971 |
| player:photo_reused | S→C | `{gameType, waitingForConsent?}` | dt:84, 646, 1004, 1653 | useSocket:727/734 |

### 4.2 Who Said That, Situational and Mixed

| Event | Dir | Payload | Emitter | Handler |
|---|---|---|---|---|
| start_game | C→S | `{code}` | Host:3585, 3681; LobbyPage:88 | idx:958 |
| game_started | S→C | `{round, totalRounds, roundType}` | idx:1000 | useSocket:98/511 |
| new_question | S→C | `{question, round, totalRounds, roundType, target?, roundDuration, startedAt}` or ToT `{…, a, b, timeLimit, secondsLeft}` | idx:494, 554 | useSocket:103/512; Host:2909 |
| answer_draft | C→S | `{code, text}` | QuestionPage:56, 69 | idx:1195 |
| submit_answer | C→S | `{code, text}` | QuestionPage:29, 85 | idx:1204 |
| answer_received | S→C | `{answeredCount, totalPlayers, answeredPlayerIds}` | idx:1231 | useSocket:114/513; Host:2933 |
| vote_skip_question | C→S | `{code}` | QuestionPage:108 | idx:1135 |
| skip_question | C→S | `{code}` | QuestionPage:102; Host:3624 | idx:1009 |
| question_changed | S→C | `{code}` | idx:1025, 1036, 1045 | **no listener** |
| voting_started | S→C | `{answers:[{text}], currentIndex, totalPlayers}` | idx:459 | useSocket:118/514; Host:2937 |
| my_answer_index | S→C | `{index}` | idx:464 | useSocket:123/515 |
| submit_vote | C→S | `{code, votedPlayerId}` | VotingPage:41, 56 | idx:1303 |
| vote_received | S→C | `{votedCount, totalPlayers, votedPlayerIds}` | idx:1323 | useSocket:127/516; Host:2942 |
| all_votes_in | S→C | `{currentIndex}` | idx:307, 720, 1328 | useSocket:131/517; Host:2947 |
| next_answer_request | C→S | `{code}` | VotingPage:60; Host:3641 | idx:1334 |
| next_answer | S→C | `{currentIndex}` | idx:1343 | useSocket:139/519; Host:2951 |
| round_ended | S→C | `{scores, players, answers, stats}` | idx:1350 | useSocket:143/520; Host:2955 |
| ready_next_round | C→S | `{code}` | RoundEndPage:17; Host:3623 | idx:1355 |
| game_ended | S→C | `{finalScores, players, stats}` | idx:527, 1298, 1369, 1420, 1442, 2177 | useSocket:147/522; Host:2960 |
| answer:pause / answer:resume | C→S | `{code}` | Host:3600 / 3599 | idx:1500 / 1512 |
| sit:voting_started | S→C | `{answers:[{id,text}], question, totalVoters}` | idx:433 | useSocket:246/541; Host:2988 |
| sit:vote | C→S | `{code, answerId}` | SituationalVotingPage:33 | idx:1238 |
| sit:vote_received | S→C | `{voteCount, totalVoters, votedPlayerIds}` | idx:1256 | useSocket:251/542; Host:2998 |
| sit:results | S→C | `{answers, scores, players, winners}` | idx:665 | useSocket:255/543; Host:3000 |
| sit:next | C→S | `{code}` | SituationalVotingPage:41; Host:3640 | idx:1281 |
| sit:force_results | C→S | `{code}` | **never emitted** | idx:1271 |
| answer_revealed | S→C | none | **never emitted** | useSocket:135/518 |
| players_ready | S→C | none | **never emitted** | useSocket:147/521 |

### 4.3 This or That

| Event | Dir | Payload | Emitter | Handler |
|---|---|---|---|---|
| tot:vote | C→S | `{code, choice:'a'\|'b'}` | thisOrThat.adapter:112 (ThisOrThatPage:33 is dead) | idx:1376 |
| tot:vote_received | S→C | `{voteCount, totalVoters, votedPlayerIds}` | idx:1396 | useSocket:222/535; Host:2965 |
| tot:timer | S→C | `{secondsLeft, paused}` | TimerManager via totGame:80 | useSocket:210/538; Host:2967 |
| tot:results | S→C | `{a, b, countA, countB, pctA, pctB, majorityChoice, voteDetails, scores, players, round, totalRounds}` | totGame:127 | useSocket:226/536; Host:2973 |
| tot:end | S→C | `{leaderboard}` | totGame:162 | useSocket:230/537; Host:2983 |
| tot:next_round | C→S | `{code}` | adapter:66; Host:3639 (ThisOrThatPage:38 dead) | idx:1408 |
| tot:skip | C→S | `{code}` | only dead ThisOrThatPage:42 | idx:1431 |
| tot:change_question | C→S | `{code}` | adapter:62 | idx:1455 |
| tot:pause / tot:resume | C→S | `{code}` | adapter:53, 57, 58 | idx:1482 / 1491 |
| tot:paused / tot:resumed | S→C | `{secondsLeft}` | idx:1488 / 1497 | useSocket:214/539, 218/540; Host:2968-2969 |

### 4.4 Most Likely To

| Event | Dir | Payload | Emitter | Handler |
|---|---|---|---|---|
| mlt:start | C→S | `{code, rounds, allowSelfVote?}` (server ignores allowSelfVote) | Host:3569, 3673; LobbyPage:65 | idx:1744 |
| mlt:prompt | S→C | `{prompt, round, totalRounds, players, gameName, jokersLeft?}` | mltGame:151; idx:1881 | useSocket:171/525; Host:2869 |
| mlt:timer | S→C | `{secondsLeft, paused}` | TimerManager via template:211 | useSocket:181/527; Host:2880 |
| mlt:voting_started | S→C | `{players, secondsLeft, round, totalRounds}` | template:219 | **no listener** |
| mlt:vote | C→S | `{code, targetPlayerId}` | mostLikelyTo.adapter:91 | idx:1791 |
| mlt:vote_received | S→C | `{voteCount, totalVoters, votedPlayerIds}` | idx:1805 | useSocket:185/528; Host:2884 |
| mlt:results | S→C | `{results, majorityPlayerIds, jokersUsed, scores, players}` | mltGame:183 | useSocket:189/529; Host:2886 |
| mlt:end | S→C | `{leaderboard}` | mltGame:204 | useSocket:194/530; Host:2896 |
| mlt:toggle_joker | C→S | `{code}` | adapter:97 | idx:1822 |
| mlt:joker_state | S→C | `{jokerActive, jokersLeft}` | idx:1835, 1839 | useSocket:199/531 |
| mlt:change_question | C→S | `{code}` | adapter:48; Host:3618 | idx:1844 |
| mlt:question_changed | S→C | `{currentPrompt}` | idx:1888 | useSocket:177/526; Host:2881 |
| mlt:next_round | C→S | `{code}` | MostLikelyToResultsPage:26; Host:3621 | idx:1812 |
| mlt:skip | C→S | `{code}` | Host:3619 (the `onMltSkip` prop is passed at 4067 but no button renders it, so it's unreachable) | idx:1894 |
| mlt:restart | C→S | `{code}` | MostLikelyToEndPage:39 | idx:1904 |
| mlt:restarted | S→C | `{code, gameName, players, gameType}` | idx:1934 | useSocket:211/534; Host:2901 |
| mlt:pause / mlt:resume | C→S | `{code}` | adapter:44/43; Host:3593/3592 | idx:1942 / 1953 |
| mlt:paused / mlt:resumed | S→C | `{secondsLeft}` | idx:1950 / 1961 | useSocket:203/532, 207/533; Host:2882-2883 |

### 4.5 Drawing (Pictionary)

| Event | Dir | Payload | Emitter | Handler |
|---|---|---|---|---|
| draw:start | C→S | `{code, rounds, mode}` | Host:3571, 3674; LobbyPage:70 | idx:1966 |
| draw:round_start | S→C | `{word\|null, round, totalRounds, timeLimit, players, mode}` | idx:594, 2007, 2013, 2210, 2216 | useSocket:269/544; Host:3005 |
| draw:secret_word | S→C | `{word, skipped?}` | idx:2010, 2049, 2058, 2212 | useSocket:303/553 |
| draw:timer | S→C | `{secondsLeft, paused}` | TimerManager (idx:332, 693) | useSocket:275/545; Host:3027 |
| draw:skip_word | C→S | `{code}` | Host:3642 | idx:2025 |
| draw:word_changed | S→C | `{word, skippedBy, skippedByName, skipsUsed, maxSkips}` | idx:2068 | useSocket:307/554; Host:3036 |
| draw:submit | C→S | `{code, strokes}` | DrawingPage:153, 195, 210, 216, 229 | idx:2080 |
| draw:submission_received | S→C | `{submittedCount, totalDrawers, submittedPlayerIds}` | idx:2052, 2060, 2075, 2105 | useSocket:279/546; Host:3031 |
| draw:skip_to_vote | C→S | `{code}` | DrawingPage:249; Host:4076 | idx:2114 |
| draw:voting_started | S→C | `{submissions, round, word, mode, totalVoters}` | idx:364 | useSocket:283/547; Host:3040 |
| draw:vote | C→S | `{code, votedForPlayerId}` | DrawingPage:242 | idx:2123 |
| draw:vote_rejected | S→C | `{reason}` | idx:2129, 2133 | useSocket:291/549 |
| draw:vote_received | S→C | `{voteCount, totalVoters, votedPlayerIds}` | idx:2146 | useSocket:287/548; Host:3045 |
| draw:show_results | C→S | `{code}` | DrawingPage:250; Host:4077 | idx:2154 |
| draw:results | S→C | `{results, scores, roundScores, round, totalRounds, leaderboard, word, mode}` | idx:385 | useSocket:295/550; Host:3050 |
| draw:next_round | C→S | `{code}` | DrawingPage:251; Host:4078 | idx:2162 |
| draw:end | S→C | `{leaderboard}` | idx:2189 | useSocket:299/551; Host:3055 |
| draw:restart | C→S | `{code}` | DrawingPage:252; DrawingEndPage:20; Host:3643 | idx:2221 |
| draw:restarted | S→C | `{code, players}` | idx:2230 | useSocket:303/552; Host:3212 |

### 4.6 Fill in the Blank

| Event | Dir | Payload | Emitter | Handler |
|---|---|---|---|---|
| fitb:start | C→S | `{code, rounds}` | Host:3573, 3675 | idx:2295 |
| fitb:round_start | S→C | `{question, round, totalRounds, players, timeLimit}` | idx:2333, 2463, 2561 | useSocket:310/555; Host:3061 |
| fitb:answer_timer | S→C | `{secondsLeft, paused}` | TimerManager (idx:2272) | useSocket:320/557; Host:3070 |
| fitb:draft | C→S | `{code, text}` | FillBlankPage:55, 66 | idx:2343 |
| fitb:answer | C→S | `{code, text}` | FillBlankPage:27, 80 | idx:2353 |
| fitb:answer_received | S→C | `{answeredCount, totalPlayers, answeredPlayerIds}` | idx:2376 | useSocket:316/556; Host:3074 (reads `totalAnswerers`, see P2-29) |
| fitb:voting_started | S→C | `{answers:[{id,text}], question, totalVoters, myAnswerIndex}` | idx:2408 (per player), 2418 (room except players) | useSocket:324/558; Host:3077 |
| fitb:vote | C→S | `{code, answerId}` | FillBlankPage:89 | idx:2473 |
| fitb:vote_received | S→C | `{voteCount, totalVoters, votedPlayerIds}` | idx:2497 | useSocket:328/559; Host:3080 |
| fitb:skip_to_vote / show_results / next_round / change_question / pause / resume | C→S | `{code}` | FillBlankPage:102/107/112; Host:3818, 4091-4093, 3621, 3606-3607 | idx:2426 / 2525 / 2533 / 2450 / 2434 / 2442 |
| fitb:results | S→C | `{answers, scores, leaderboard, round, totalRounds, question}` | idx:2515 | useSocket:332/560; Host:3084 |
| fitb:end | S→C | `{leaderboard}` | idx:2545 | useSocket:336/561; Host:3087 |
| fitb:restart | C→S | `{code}` | FillBlankPage:117; FillBlankEndPage:17 | idx:2571 |
| fitb:restarted | S→C | `{code, players}` | idx:2579 | useSocket:341/562 (Host: none) |

### 4.7 Selfie Roast (server in dtGame.js)

| Event | Dir | Payload | Emitter | Handler |
|---|---|---|---|---|
| selfie:start | C→S | `{code, rounds}` | Host:3575, 3676; LobbyPage:79 | dt:38 |
| selfie:photo_phase | S→C | `{round, totalRounds, players, totalPhotographers}` | dt:79, 500, 557 | useSocket:347/563; Host:3093 |
| selfie:submit_photo | C→S | `{code, photoData}` (also used for the DT selfie) | SelfiePhotoPage:19 | dt:89 |
| selfie:photo_received | S→C | `{photoCount, totalPhotographers, submittedPlayerIds}` | dt:186 | useSocket:353/564; Host:3097 |
| selfie:skip_to_drawing | C→S | `{code}` | **never emitted** | dt:274 |
| selfie:draw_assigned | S→C | `{photoData, ownerName, ownerColor, ownerPlayerId, prompt, promptTemplate}` | dt:157, 172, 234 | useSocket:357/565 |
| selfie:drawing_phase | S→C | `{players, totalDrawers, promptTemplate, secondsLeft}` | dt:250 | useSocket:362/566; Host:3100 |
| selfie:timer | S→C | `{secondsLeft, paused}` | TimerManager (dt:257) | useSocket:366/567 |
| selfie:drawing_ending | S→C | none | dt:264, 362 | SelfieDrawPage:143 (off at :144) |
| selfie:submit_drawing | C→S | `{code, strokes}` | SelfieDrawPage:90, 110, 121, 130, 138 | dt:284 |
| selfie:drawing_received | S→C | `{drawingCount, totalDrawers, drawnPlayerIds}` | dt:301 | useSocket:378/570; Host:3107 |
| selfie:skip_to_vote | C→S | `{code}` | Host:3823 | dt:354 |
| selfie:pause / selfie:resume | C→S | `{code}` | **never emitted** | dt:372 / 381 |
| selfie:paused / selfie:resumed | S→C | `{secondsLeft}` | dt:378 / 387 | useSocket:370/568, 374/569 |
| selfie:voting_started | S→C | `{submissions, totalVoters}` | dt:348 | useSocket:382/571; Host:3110 |
| selfie:vote | C→S | `{code, drawerId}` | SelfieVotePage:24 | dt:390 |
| selfie:vote_received | S→C | `{voteCount, totalVoters, votedPlayerIds}` | dt:407 | useSocket:387/572; Host:3114 |
| selfie:show_results | C→S | `{code}` | SelfieVotePage:30; Host:3823, 4089 | dt:466 |
| selfie:results | S→C | `{submissions, scores, leaderboard, promptTemplate, round, totalRounds, isFinal}` | dt:458, 461 | useSocket:391/573; Host:3118 |
| selfie:next_round / skip_question / retake_photo / restart | C→S | `{code}` | Host:3625 / 3626; SelfieDrawPage:149; SelfieResultsPage:49 | dt:474 / 504 / 562 / 573 |
| selfie:prompt_updated | S→C | `{prompt?, promptTemplate}` | dt:529, 536 | useSocket:401/575; Host:3104 |
| selfie:retake_ready | S→C | `{}` | dt:570 | useSocket:405/576 |
| selfie:restarted | S→C | `{code, players}` | dt:581 | useSocket:396/574 |

### 4.8 Caption and PhotoVote (dtGame.js)

| Event | Dir | Payload | Emitter | Handler |
|---|---|---|---|---|
| caption:start | C→S | `{code, rounds}` | Host:3577, 3677; LobbyPage:82 | dt:589 |
| caption:photo_phase | S→C | `{round, totalRounds, players}` | dt:637 | useSocket:411/577; Host:3123 |
| caption:submit_photo | C→S | `{code, photoData}` | CaptionPhotoPage:18 | dt:651 |
| caption:photo_submitted | S→C | `{playerId, submittedCount, totalCount}` | dt:677 | useSocket:415/578 (Host: none) |
| caption:writing_phase | S→C | `{round, totalRounds, prompt, featuredOwnerId, featuredOwnerName, featuredPhotoData, writers}` | dt:705 | useSocket:418/579; Host:3127 |
| caption:submit_caption | C→S | `{code, text}` | CaptionWritePage:25, 56 | dt:716 |
| caption:caption_submitted | S→C | `{playerId, submittedCount, totalCount}` | dt:737 | useSocket:422/580; Host:3131 (reads `submittedPlayerIds`, which isn't sent) |
| caption:voting_phase | S→C | `{captions, featuredOwnerId, featuredOwnerName, featuredPhotoData}` | dt:759 | useSocket:425/581; Host:3134 |
| caption:your_caption_id | S→C | `{captionId}` | dt:770 | useSocket:429/582 |
| caption:vote | C→S | `{code, captionId}` | CaptionVotePage:26 | dt:775 |
| caption:vote_received | S→C | `{voteCount, totalVoters, votedPlayerIds}` | dt:798 | useSocket:432/583; Host:3138 |
| caption:skip_to_voting | C→S | `{code}` | Host:4101 (prop defined, **no button renders it**) | dt:808 |
| caption:change_question / skip_to_results / next_round / restart | C→S | `{code}` | Host:4100 / 4102 / 4103; CaptionResultsPage:17 / 15 | dt:816 / 827 / 871 / 896 |
| caption:round_results | S→C | `{round, totalRounds, featuredOwnerName, featuredPhotoData, prompt, captionResults, roundScores, scores}` | dt:859 | useSocket:435/584; Host:3142 |
| caption:game_over | S→C | `{scores, leaderboard}` | dt:881 | useSocket:439/585; Host:3145 |
| caption:restarted | S→C | `{code, players}` | dt:904 | useSocket:443/586; Host:3148 |
| pmatch:start | C→S | `{code}` | LobbyPage:76 | dt:914 |
| photovote:start | C→S | `{code, subType, rounds}` | Host:3579, 3581, 3678, 3679 | dt:935 |
| photovote:photo_phase | S→C | `{subType, round, totalRounds, players, prompt?}` | dt:928, 993, 1143, 1270 | useSocket:448/587; Host:3154 |
| photovote:submit_photo | C→S | `{code, photoData}` | PhotoVotePhotoPage:20 | dt:1009 |
| photovote:photo_submitted | S→C | `{playerId, submittedCount, totalCount}` | dt:1035 | useSocket:452/588; Host:3164 |
| photovote:voting_phase | S→C | `{subType, round, totalRounds, prompt, photos}` | dt:1080, 1170 | useSocket:455/589; Host:3170 |
| photovote:vote | C→S | `{code, targetPlayerId}` | PhotoVotePage:23 | dt:1089 |
| photovote:vote_received | S→C | `{voteCount, totalVoters, votedPlayerIds}` | dt:1109 | useSocket:459/590; Host:3180 |
| photovote:change_question / skip_to_results / next_round / restart | C→S | `{code}` | Host:4096 / 4097 (**no button renders skip_to_results**) / 4098; PhotoVoteResultsPage:18 / 16 | dt:1119 / 1179 / 1233 / 1286 |
| photovote:round_results | S→C | `{round, totalRounds, prompt, voteResults, roundScores, scores}` | dt:1223 | useSocket:462/591; Host:3187 |
| photovote:game_over | S→C | `{scores, leaderboard}` | dt:1250 | useSocket:466/592; Host:3195 |
| photovote:restarted | S→C | `{code, players}` | dt:1294 | useSocket:470/593; Host:3202 |

### 4.9 Draw Telephone (dtGame.js)

| Event | Dir | Payload | Emitter | Handler |
|---|---|---|---|---|
| dt:start | C→S | `{code}` | Host:3583, 3680; LobbyPage:73 | dt:1605 |
| dt:error | S→C | `{message}` | dt:1613 | Host:3296 only (phone LobbyPage start gets no feedback) |
| dt:selfie_phase | S→C | `{players, photoCount, totalPhotographers}` | dt:1648 | useSocket:595/706; Host:3219 |
| dt:reuse_photo | C→S | `{code}` | **never emitted** (reuse re-sends `selfie:submit_photo`) | dt:1658 |
| dt:photo_received | S→C | `{photoCount, totalPhotographers, submittedPlayerIds}` | dt:123, 1672 | useSocket:599/707; Host:3225 |
| dt:prompt_phase | S→C | `{players, totalPrompts, secondsLeft}` | dt:128, 1677 | useSocket:602/708; Host:3229 |
| dt:submit_prompt | C→S | `{code, templateText}` | DrawTelPromptPage:21, 51 | dt:1682 |
| dt:prompt_rejected | S→C | `{reason}` | dt:1694 | useSocket:609/710 |
| dt:prompt_received | S→C | `{submittedCount, totalPrompts, submittedPlayerIds}` | dt:1337, 1702 | useSocket:606/709; Host:3235 |
| dt:drawing_phase | S→C | `{totalChains, players}` | dt:1809 | useSocket:612/711; Host:3239 |
| dt:your_turn | S→C | `{promptId, finalText, existingStrokes, originalSelfieData, position, totalPositions, secondsLeft}` | dt:1473 | useSocket:618/712 |
| dt:turn_timer | S→C | `{promptId, secondsLeft}` | dt:1398 | useSocket:622/713 |
| dt:drawer_timer | S→C | `{playerId, secondsLeft}` | dt:1400 | Host:3250 |
| dt:time_up | S→C | `{promptId}` | dt:1410 | DrawTelDrawPage:251 (off at :252) |
| dt:submit_strokes | C→S | `{code, promptId, strokes}` | DrawTelDrawPage:112, 199, 217, 230 | dt:1820 |
| dt:background_strokes_updated | S→C | `{promptId, existingStrokes}` | dt:1845 | DrawTelDrawPage:263 (off at :264) |
| dt:chain_progress | S→C | `{chainsCompleted, totalChains, activeDrawerIds}` | dt:1441, 1879 | useSocket:625/714; Host:3246 |
| dt:drawing_progress | S→C | `{promptId, stepsDone, totalSteps, drawerId, drawerName, activeDrawerIds}` | dt:1487 | useSocket:638/715; Host:3254 |
| dt:guessing_phase | S→C | `{totalGuessers, secondsLeft, guessPayloads:{[targetId]:payload}}` | dt:1521 | useSocket:655/716; Host:3262 |
| dt:your_guess | S→C | cached guess payload | dt:1533, 1901 | useSocket:670/717 |
| dt:request_guess | C→S | `{code}` | DrawTelWaitPage:38 | dt:1893 |
| dt:submit_guess | C→S | `{code, promptId, guessText}` | DrawTelGuessPage:23, 54 | dt:1907 |
| dt:guess_received | S→C | `{guessedCount, totalGuessers, guessedPlayerIds}` | dt:1929 | useSocket:675/718; Host:3267 |
| dt:reveal_phase | S→C | `{totalPrompts}` | dt:1944 | useSocket:678/719; Host:3271 |
| dt:reveal_update | S→C | reveal payload (chain, steps, guesses, votes) | dt:1379, 1950, 1993, 2021 | useSocket:683/720; Host:3276 |
| dt:reveal_next | C→S | `{code}` | DrawTelRevealPage:32; Host:3813 | dt:1953 |
| dt:vote | C→S | `{code, promptId, vote}` | DrawTelRevealPage:38 | dt:1996 |
| dt:vote_received | S→C | `{promptId, voteCount, totalVoters, votedPlayerIds}` | dt:2012 | useSocket:686/721; Host:3281 |
| dt:skip_to_reveal | C→S | `{code}` | **never emitted** | dt:2080 |
| dt:end_game | C→S | `{code}` | DrawTelRevealPage:44 | dt:2088 |
| dt:end | S→C | `{scores, leaderboard}` | dt:2074 | useSocket:689/722; Host:3285 |
| dt:pause / dt:resume | C→S | `{code}` | Host:3614 / 3613 | dt:2096 / 2121 |
| dt:paused / dt:resumed | S→C | none | dt:2118 / 2140 | useSocket:697/724, 700/725; Host:3301, 3305 |
| dt:restart | C→S | `{code}` | DrawTelEndPage:19 | dt:2143 |
| dt:restarted | S→C | `{code, players}` | dt:2152 | useSocket:693/723; Host:3290 |

### 4.10 Flags

**Emitted but never handled:**
- S→C with no listener: `question_changed` (idx:1025/1036/1045) and `mlt:voting_started` (template:219).
- C→S with no server handler: `drawing:toggle_pause` and `drawing:change_question` (drawing.adapter:28, 32), and `trivia:toggle_pause` and `trivia:change_question` (trivia.adapter:28, 32). All four sit in dead or unrouted adapters.

**Handlers for events that are never emitted:**
- Client: `answer_revealed` and `players_ready` (useSocket:135/518, 147/521).
- Server handlers that no live client code emits: `sit:force_results` (idx:1271), `selfie:skip_to_drawing` (dt:274), `selfie:pause` and `selfie:resume` (dt:372/381), `dt:reuse_photo` (dt:1658) and `dt:skip_to_reveal` (dt:2080).
- `tot:skip` is only emitted from the dead `ThisOrThatPage.jsx:42`.
- `mlt:skip`, `caption:skip_to_voting` and `photovote:skip_to_results` are wired as HostControlBar props (HostPage:4067, 4101, 4097), but no button renders them.

**Payload-name mismatches:**
- `fitb:answer_received` sends `totalPlayers` (idx:2376), but the Host reads `totalAnswerers` (HostPage:3074-3075).
- `caption:caption_submitted` doesn't send `submittedPlayerIds` (dt:737), but the Host reads it (HostPage:3132).
- `fitb:round_start` doesn't send `totalAnswerers`, but the Host reads it (HostPage:3064).

**Listener cleanup and leaks:**
- `useSocket.js`: every `on` has a matching `off` (746-864). The `visibilitychange` listener is removed (:749).
- `DrawTelDrawPage.jsx:251-252, 263-264` and `SelfieDrawPage.jsx:143-144` clean up correctly.
- `HostPage.jsx` never calls `off`; it relies on disconnecting the whole socket. The spectator effect disconnects on unmount (`:3507`). The **creator-flow socket from `handleCreateRoom` (`:3511-3562`) has no unmount cleanup.** It stays connected, with about 100 listeners that call `setState` on an unmounted component, until a new room is created (the old socket is dropped at `:3523-3526`). "New Party Pack" (`:3716-3721`) also leaves the old room's socket connected while the create form is open. Severity P3.
- `useSocket`'s effect depends on `navigate` (`:866`). In react-router 6.30.3, `navigate` changes identity on every pathname change (`node_modules/react-router/dist/index.js:246`). So all ~120 listeners are torn down and re-attached on every route change, and the effect also calls `onConnect()` again (`:487-489`). That is not a leak, but see P1-14.


---

## 5. Shared UI components

| Element | Path | Props / API | Used by | Notes |
|---|---|---|---|---|
| **TimerRing** | `components/game/TimerRing.jsx` | `secondsLeft, total=30, paused, size=80` | App.jsx (GlobalTimerOverlay), PlayerGameLayout (MLT/ToT/Trivia), HostLeftRail, HostPage (MLT/Question/Voting/Sit/Draw/DT/FITB panels), DrawingPage, DrawTelDrawPage, SelfieDrawPage | Uses fixed thresholds: ≤15s yellow, ≤8s red and pulsing. The track and text colours are hard-coded. Not used by Question, Voting, Situational or FITB player pages. |
| **useRoundTimerSync** | `game-core/hooks/useRoundTimerSync.js` | `(timer) → {secondsLeft, paused, total}` | **Nobody** | Dead code. It would make a good normaliser. |
| **ConfirmVoteCard** | `game-core/player/ConfirmVoteCard.jsx` | Takes only `onConfirm, confirmLabel`. Callers also pass `vote, onChange, changeLabel, titleLabel`, which are **ignored**. The docstring describes an avatar/badge summary that isn't implemented. | VotingPage, SituationalVotingPage, MLT PlayerView, ToT PlayerView, FillBlankPage, CaptionVote, PhotoVote, SelfieVote, DrawingPage | Has no Change button, no summary of the choice, no disabled state and no i18n. |
| **useVoteConfirmation** | `game-core/hooks/useVoteConfirmation.js` | `{onConfirmSubmit, resetKey} → {pending, confirmed, choose, change, confirm}` | ToT PlayerView only | Clean state machine: it resets on `resetKey` and guards re-confirm. Every other page rolls its own `pendingVote` useState. |
| **VoteLocked** | `components/game/VoteLocked.jsx` | `voteCount, totalVoters, label, accentColor` | VotingPage, SituationalVotingPage, ThisOrThatPage (dead) | "Waiting for others…" is hard-coded English (line 28). MLT and ToT PlayerViews use their own `LockedVoteCard` / `LockedTotCard`. |
| **VoteCoin** | `components/game/VoteCoin.jsx` | `coinIndex, cardIndex, isJoker, baseDelay` | SituationalVotingPage results, FillBlankPage results, MostLikelyToResultsPage, HostPage | Consistent wherever it's used. Classic and ToT results don't use it. |
| **Game intro screen** | none | none | none | Missing everywhere. The game jumps from the lobby straight into round 1. |
| **Waiting / player status (host)** | `game-core/host/PlayerStatusBubbles.jsx` | `players[{id,name,color,status}], statusLabel` | HostGameLayout (MLT/ToT host views) | Only handles the `voted` status. HostPage has a separate `PlayerAvatar` (HostPage.jsx:38) with `voted/answered/waiting` statuses for every other panel. |
| **Waiting (player)** | VoteLocked, MiniGameWrapper waiting phase, LockedVoteCard, LockedTotCard, FITB dots | various | per page | Players only ever see counts, never who is still missing. |
| **Player list / avatars** | Inline in each page; `PlayerAvatar` on HostPage | none | none | Initial-in-coloured-circle is duplicated in 10+ places at different sizes (w-7 to w-14). |
| **Leaderboard** | `components/game/Leaderboard.jsx` | `entries[{id|playerId,name,color,score,title}], accentColor, pts` | GameEndShell | Staggered slide-in. |
| **GameEndShell** | `components/game/GameEndShell.jsx` | `title, subtitle, leaderboard, accentColor, pts, isHost, onPlayAgain, playAgainLabel, gameType, children` | GameEndPage, ThisOrThatEndPage, FillBlankEndPage, DrawingEndPage, DrawTelEndPage | MostLikelyToEndPage doesn't use it and has its own podium plus looping confetti. "🏠 Main Menu" is hard-coded (line 559). |
| **Per-round scoreboard** | inline | none | MLT results (rank delta ▲▼ and animated bars), ThisOrThatPage `ScoreBoard` (dead), VotingPage reveal standings, FITB results leaderboard | 4 different implementations. |
| **PlayerGameLayout** | `game-core/layouts/PlayerGameLayout.jsx` | `frame{gameName,roundLabel,promptLabel,prompt,timer}, selectionUI, confirmUI, jokerUI` | MLT PlayerView, ToT PlayerView, Trivia (placeholder) | The only shared player layout that includes a timer. |
| **HostGameLayout** | `game-core/layouts/HostGameLayout.jsx` | `frame, onPauseToggle, onChangeQuestion, onNextRound, onSkipMiniGame, centerContent, onOpenGamePicker, onOpenMainMenu, onCopyHostUrl` | MLT HostView (voting only), ToT HostView, Trivia | The host top bar, left rail and footer come from here. Every other game uses the HostPage header, `renderPanel()` and `HostControlBar`. |
| **GameRoundShell** | `components/GameRoundShell.jsx` | `mode, modeColor, prompt, subPrompt, roundLabel, children` | **Nobody** | Dead code. |
| **GamePageWrapper** | `components/GamePageWrapper.jsx` | `children` → `<>{children}</>` | Caption*, DrawTel* pages | A no-op. |
| **MiniGameWrapper (live)** | `components/MiniGameWrapper.jsx` | `hasConfirmed, onConfirm, onEditResponse, onChangePrompt, confirmLabel, editLabel, disableConfirm, isHost, waitingMessage` | QuestionPage, FillBlankPage, CaptionWrite, Drawing, DrawTel*, SelfieDraw | The canonical Input → Confirm → Waiting/Edit component. Its defaults are English (lines 29-33, 76). |
| **MiniGameWrapper (game/)** | `components/game/MiniGameWrapper.jsx` | `mode, onConfirm, onEditResponse, …` (keeps its own `isConfirmed` state) | Tests only | A duplicate. |
| **useMiniGameLifecycle** | `hooks/useMiniGameLifecycle.js` | `{onSubmit, resetKey, initialConfirmed} → {hasConfirmed, confirm, editResponse, markConfirmed}` | The same pages as MiniGameWrapper | `confirm()` has no `hasConfirmed` guard (line 586). |
| **actions/** | `components/actions/{TextInput,VoteCaption,VoteGrid,PhotoCapture}Action.jsx` via `ActionController.jsx` | per file | **ActionController is imported by nobody** | Dead code, although `TextInputAction` is the best text input: it trims, has maxLength, a counter and a disabled-when-empty button. |
| **ConnectionOverlay** | `components/ConnectionOverlay.jsx` | reads store | App.jsx (player routes only) | Good behaviour but English-only. Not mounted on `/host`. |
| **Host controls config** | `config/hostControls.js` | `buildHostControls(ctx)` → buttons keyed by status, plus `QUEUE_GAME_LABELS` | Only `QUEUE_GAME_LABELS` is imported, by HostPage | `buildHostControls` is dead. HostPage's `HostControlBar` (HostPage.jsx:2289+) re-implements it inline. MLT/ToT use `HostControlFooter`. |
| **HostTopBar / HostLeftRail / HostControlFooter** | `game-core/host/*` | see the files | HostGameLayout | Footer labels are hard-coded English. |
| **JokerButton** | `game-core/player/JokerButton.jsx` | `left, active, onClick, *Label` | MLT PlayerView | Fine, and translated through props. |
| **GameSwitcher** | `components/GameSwitcher.jsx` | `currentGameType` | GameEndShell, MostLikelyToEndPage, SelfieResults | Game labels differ from the HostPage picker and `QUEUE_GAME_LABELS` (see P2-18). |

**Host controls across ALL games (TV bar):**

| Status | Pause | Change/skip question | Advance (skip-to-vote / show results / next) | Skip mini game | End-of-game set |
|---|---|---|---|---|---|
| WST question / voting | ✅ / ✅ | Skip Question / – | – / Next Answer | ✅ / ❌ | ✅ game-end |
| round-end | – | – | Next Round | ✅ | – |
| MLT voting / results | ✅ / – | Change Q (`onMltSkip` is wired but unused) | – / Next Round | ✅ | ✅ mlt-end |
| ToT | ❌ (server has `tot:pause`, `index.js:1482`) | Skip/Next | – | ✅ | ✅ tot-end |
| Situational voting / results | ✅ / – | – | Show Results / Next Round | ❌ / ✅ | – |
| Drawing | ❌ | New Word | Show Results, Next Round (no skip-to-vote) | ✅ | ✅ draw-end |
| FITB | ✅ | Change Q | Show Results, Next Round (skip-to-vote only in the panel) | ✅ | ✅ fitb-end |
| Selfie | ❌ (server supports it) | Change Q | Show Results, Next Round (no skip-to-drawing/vote) | ✅ | ✅ selfie-results |
| Caption | ❌ (no timer) | Change Q | Show Results, Next Round (**no skip-to-voting**) | ✅ | ❌ none |
| Photo Vote | ❌ (no timer) | Change Q | Next Round (**no Show Results**) | ✅ | ⚠️ partial |
| Draw Telephone | ✅ | – | Reveal Next (panel) | ✅ | ✅ dt-end |

The buttons look consistent (yellow outline for pause, grey outline for change/skip, filled accent for advance). The gaps are functional, not visual.

---

## 6. Consistency audit

### 6.1 Canonical version of each element

| Element | Canonical choice | Rule it enforces |
|---|---|---|
| **Pre-game intro** | **New `GameIntroCard`**, fed by a single game registry: icon, name, 1–2 line rules from the existing `t.<game>.gameDesc` strings, a server-driven "Starting in 3…2…1" countdown, and ready avatars (`PlayerStatusBubbles`). Shown on TV and phones before round 1 of every game, including each game inside a playlist. | Every game starts the same way. |
| **Timer** | **`TimerRing`**, placed by `PlayerGameLayout` (phone, top-right of the prompt header) and `HostLeftRail` (TV), fed by `useRoundTimerSync` (currently unused). Server-driven ticks; the client never counts down on its own. Proportional warning (≤25% of total or ≤5 s: red + pulse). Shows ⏸ when paused. At 0 the server closes the phase and the client auto-submits the draft or pending selection. Remove `GlobalTimerOverlay`, or restrict it to phases with no page timer. | One timer per screen, same look and thresholds, same behaviour at 0. |
| **Confirm / submit** | Text and drawing answers: **`MiniGameWrapper` + `useMiniGameLifecycle`**, with `TextInputAction`'s input rules merged in (trim, `maxLength` + counter, disabled when empty or whitespace, input read-only after confirm, `confirm()` guarded against re-entry). Votes: **`useVoteConfirmation` + a fixed `ConfirmVoteCard`** that renders the choice summary, "← Change", a translated title/labels and a disabled state, then **`VoteLocked`** once confirmed. | **Change rule (proposed):** you can change a pick freely until you press Confirm. After Confirm, text and drawing answers can be edited ("✏️ Edit") until the phase closes; votes are final. This matches what the server already does (answers upsert, votes dedupe), except for DT prompt/guess (see P1-15 and Q2). |
| **Waiting for others** | **`PlayerStatusBubbles`**, generalised to `answered / waiting / disconnected`, replacing HostPage's `PlayerAvatar`. Phones show "Waiting for N: Bob, Carl". The denominator is always the server's count of playing, connected players. | Same count on TV and phones; names, not just numbers. |
| **Reveal / results** | Extract **MLT's results screen** (stagger, bar growth, winner highlight, `VoteCoin` drop, per-round scoreboard with rank deltas) as `RoundResults` + `RoundScoreboard`. | Same reveal rhythm in every voting game. |
| **Game end + transition** | **`GameEndShell` + `Leaderboard`** everywhere, including MLT (podium as `children`), Selfie, Caption and Photo Vote, with `isHost` passed through. In a playlist, the TV shows "▶ Next: <game name>" and phones show "Next up: <game>… waiting for host". After the last game, the TV shows a playlist scoreboard built from `globalScores`. | Every game ends on the same screen, and every game can advance the playlist. |
| **Host-only controls** | One declarative `buildHostControls(status)` (already in `config/hostControls.js`, unused), rendered by one `HostControlBar` and reused by `HostControlFooter`. Every phase exposes: Pause/Resume (if timed), Change question (if applicable), **Advance** (skip-to-next-phase / show results / next round), Skip mini game. Buttons disable themselves while a request is in flight; the server enforces host + expected state. Non-hosts see "Waiting for host…". | No phase without an escape hatch, and no double-advance. |
| **Mobile layout** | `PlayerGameLayout` with a top safe area (≥ 64 px, below the Lang/Sound toggles), the room badge moved into the header (not floating), `break-words` on all user text, canvases sized to the container, no fixed `px` widths wider than 320. | Nothing hidden or overlapped at 360 px. |
| **RTL / i18n** | Every visible string comes from `translations[lang]`. Logical CSS only (`ms-/me-/start/end/text-start`). | Hebrew is fully mirrored and translated. |
| **Loading / error / empty** | Shared `<ScreenState kind="loading|error|empty">`. Socket acks for submits, so a rejected photo or answer shows an error and a retry. | No silent "submitted ✓" that the server rejected. |

### 6.2 Consistency matrix

✅ uses shared/canonical · ⚠️ custom but equivalent · ❌ custom and inconsistent, or missing

| Game | Intro | Timer | Submit / confirm | Change-answer rule | Waiting for others | Reveal & results | End & next game | Host controls | 360 px | RTL/i18n | Loading/error/empty |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Who Said That | ❌ none | ❌ two timers on the answer screen (ring + "⏳ Ns") ✔; voting: red text; frozen ring on round-end 📖 | ✅ answer MiniGameWrapper · ⚠️ vote ConfirmVoteCard (no Change/summary) | ⚠️ answer editable ✔; vote re-tap before confirm | ⚠️ "x / y answered" with a wrong denominator ✔ | ⚠️ fake flip + summary, no coins | ⚠️ GameEndShell but **Play Again shown to all** ✔ | ❌ double-tap skips an answer ✔ | ❌ header under toggles ✔; long text overflows ✔ | ⚠️ mostly translated, some literals | ⚠️ empty round-end box |
| Situational | ❌ | ❌ text timers; ring hidden in voting | ⚠️ ConfirmVoteCard | ⚠️ | ✅ VoteLocked | ⚠️ coins, no score delta | ⚠️ via GameEndPage | ⚠️ | ❌ title under toggles 📖 | ⚠️ `votesIn` key missing | ⚠️ |
| Most Likely To | ❌ | ✅ TimerRing (total hard-coded 30) | ⚠️ ConfirmVoteCard (hard-coded "✓ Confirm") | ⚠️ re-tap before confirm | ⚠️ LockedVoteCard | ✅ best in class | ❌ custom podium, looping confetti | ❌ double-tap skips a round 📖 | ❌ room badge covers Confirm ✔ | ⚠️ host strings English | ✅ |
| This or That | ❌ | ✅ TimerRing | ❌ first tap disables both options ✔ | ❌ cannot change ✔ | ⚠️ LockedTotCard | ❌ **no results on phones** ✔ | ✅ GameEndShell | ❌ double-click skips a round ✔; no TV pause | ⚠️ | ❌ labels not passed | ❌ no results/empty |
| Fill in the Blank | ❌ | ❌ always-red text; **no voting timer** | ✅ MiniGameWrapper (empty allowed) ✔ | ⚠️ Enter re-submits after confirm 📖 | ⚠️ dots / plain text | ⚠️ coins, plain leaderboard | ⚠️ one phone stuck on round results ✔ | ❌ phone host buttons never rendered 📖 | ✅ `mt-16` | ❌ no `fitb` translations | ⚠️ |
| Drawing | ❌ | ✅ TimerRing (90 s, ignores room setting) | ✅ MiniGameWrapper, keep-drawing-to-update | ✅ | ⚠️ counts only | ⚠️ custom list | ✅ GameEndShell | ⚠️ no pause / skip-to-vote on TV | ❌ fullscreen hides Submit ✔; squashed vote thumbnails 📖 | ⚠️ partial | ⚠️ |
| Draw Telephone | ⚠️ inline rules card | ❌ ring (draw, total 45 hard-coded) + text elsewhere; TV local countdown 📖 | ✅ MiniGameWrapper | ❌ Edit prompt/guess **silently dropped** 📖 | ✅ Wait page | ⚠️ 3-step reveal | ✅ GameEndShell | ⚠️ no skip-to-reveal | ❌ guess canvas cropped 📖 | ❌ | ⚠️ |
| Draw on Friends | ❌ | ⚠️ ring in drawing; **no timer in photo/vote** | ⚠️ fullscreen Submit not disabled when empty 📖 | ✅ | ⚠️ dots | ❌ "final results" + confetti after every round 📖 | ❌ custom page; phone Play Again restarts mid-game 📖 | ❌ no pause/skip on TV | ✅ | ❌ none | ⚠️ |
| Selfie Captions | ❌ | ❌ **none** (dead code on page) | ✅ MiniGameWrapper | ✅ (server even accepts edits during voting) | ⚠️ count | ⚠️ custom | ❌ **TV has no end screen**, only "Skip Mini Game" ✔ | ❌ no skip-to-voting / photo skip | ✅ | ❌ none | ⚠️ |
| Photo Vote (Selfie Challenge / Prompt Match) | ❌ | ❌ **none** | ⚠️ ConfirmVoteCard | ⚠️ | ⚠️ count | ⚠️ custom, no 🥉 | ❌ phones stay on "Waiting for host…" at game end ✔; no "▶ Next" on TV 📖 | ❌ no Show Results in voting | ✅ | ❌ none | ✅ 🤷 placeholder |

**Conclusions from the matrix**
- No game has an intro.
- There are 5 timer styles.
- Only ToT uses the confirm state machine, and its variant is the one that is broken.
- Only 5 of 11 end screens share `GameEndShell`.
- The photo games have no timers and no host escape hatches.

---

## 7. Functional test results

### 7.1 Scenario coverage (runtime)

| Scenario | Games run | Result |
|---|---|---|
| Happy path, 1 TV + 3 phones, full game | WST, Situational, MLT, ToT, FITB, Drawing, Draw Telephone, Selfie Roast, Caption, Selfie Challenge, Prompt Match | All reach a final scoreboard on the TV, **except Caption**, whose TV shows no end screen (P1-07). Phones end on inconsistent screens in FITB and Photo Vote (P2-06, P2-07). ToT phones never see round results (P1-03). |
| Player never submits → timer expires | WST (all idle), MLT (votes not cast) | ✅ Advances. Idle WST players get the placeholder answer "Didn't have time to think of something funny.", so the vote screen can show three identical answers (Q9). Caption and Photo Vote have **no timer** (P1-06). |
| Everyone submits early | All 11 | ✅ Advances without waiting in every timed phase. Voting phases wait for the host by design. |
| Submit at the last second | WST, FITB (auto-submit at 0) | ✅ No state corruption (server phase guards drop late events); an unconfirmed vote is lost (P2-14). |
| Empty / whitespace / 5,000 chars / emoji / Hebrew / `<script>` | WST | Whitespace submit is **enabled** ✔ (P2-09). The client truncates the 5,000-character input to 150 characters, but it still **overflows the card** on the phone and TV ✔ (P2-08). Emoji, Hebrew and HTML render as plain text (no XSS) ✔. |
| Rapid triple-click on Submit/Confirm | WST answer, all vote pages (autoplayer) | ✅ No duplicate submits (the button unmounts and the server dedupes). ❌ Host **Next** double-click skips content ✔ (P1-01). |
| Large photo (4032×3024 JPEG) / many strokes | Selfie, Caption, Photo Vote, Drawing | ✅ Client compresses photos to 640 px. Strokes over 300 points are silently truncated by the server 📖 (P2-25). |
| Player refreshes mid-round | WST | ✅ Returns to the same screen with the answer kept. ❌ The counter jumps from "1 / 3" to "0 / 4" ✔ (P2-03). ❌ An unsent draft is lost ✔ (P3). |
| Player disconnects permanently | WST | ⚠️ Doesn't hang, but waits the **full timer** even though everyone left has answered ✔ (P2-01). Phases with no timer would hang (P1-06). |
| Host TV refreshes | WST | ✅ The game continues. ❌ The TV header shows "ROUND 0 OF 0" ✔ (P2-04). |
| Player joins mid-game | WST | ❌ The URL is `/question` but the screen shows the lobby, the TV counts them in the answer total ("0/4"), and they're then allowed to vote ✔ (P1-08). |
| Two rooms at once | 4 rooms in parallel (4 concurrent runs) | ✅ No state leakage 📖✔. |
| Room cleanup after everyone leaves | — | ❌ Rooms are only evicted by the 60-min idle sweep, which also evicts **active** rooms and doesn't cancel timers 📖 (P2-43). |
| Browser back button | WST (submitted and unsubmitted) | ✅ Stays on the game screen. |
| Server restart mid-round | WST | ❌ **Server crashes** on the next answer ✔ (P0-02). |
| Malformed payload | — | ❌ **Server crashes** ✔ (P0-01). |
| Min player count | All | TV requires 3 for everything. The server requires 3/2/0 depending on the game, and most starts fail **silently** 📖 (P2-42). |
| Playlist | MLT → WST → Situational (advanced correctly); Drawing → Selfie → Caption → Selfie Challenge → Prompt Match → ToT | ✔ The first three advanced correctly via "▶ Next". ❌ **Draw on Friends → Selfie Captions: every phone is stuck on the Lobby** while the TV runs the game (P0-04). ❌ **The Selfie Challenge end screen has no "▶ Next" or Skip, so the playlist stops** (P1-06), and ToT after it was never reached. ❌ "▶ Next" shows raw ids (P3-02). ❌ No playlist-final scoreboard (P2-20) |

Console during all runs:
- Only React Router v7 future-flag warnings.
- Missing-`key` warnings in `FitbHostPanel` and `SelfieHostPanel`.
- `AudioContext` autoplay warnings.
- 503s from `/api/upload-url`, expected without storage (P3).

No leaked socket listeners in player pages (all `on`/`off` are paired). The TV creator socket isn't cleaned up on unmount (P3-15).

### 7.2 Bug list (sorted by severity)

Severity: **P0** crash/blocker · **P1** broken feature · **P2** inconsistency · **P3** polish.

#### P0 — crash / blocker

| ID | Game/Area | Steps to reproduce | Expected | Actual | Sev | Suspected root cause |
|---|---|---|---|---|---|---|
| P0-01 | Server (all rooms) | Any client runs `socket.emit('submit_answer')` with no payload. Also `add_custom_question` with a non-string `text`, or `create_room` with `null`. | Ignored | ✔ **The whole Node process exits**, killing every room | P0 | Handlers destructure without a default, e.g. `server/index.js:1204` `({ code, text }) =>`, `:952` `text.trim()`. socket.io 4.8 runs listeners in `process.nextTick`, and there is no `uncaughtException` guard or handler wrapper anywhere in `server/` |
| P0-02 | Persistence / restart (WST, MLT, Selfie, Caption, Photo Vote) | Start WST and reach the answer phase. Restart the server. A player rejoins and submits. | The game continues | ✔ `TypeError: room._answerTracker?.record is not a function`; **server crash**. The bad state stays in `.data/rooms.json`, so it crashes again after every restart | P0 | `server/game/persistence.js:39-58` strips helpers only from draw/sit/mlt/fitb. `room._answerTracker`, `mlt._roundManager/_phaseManager` and `selfie/caption/photoVote._voteCollector` are saved as `{}` and restored as truthy objects (`index.js:1225`, `dtGame.js:398,789,1099`, `VotingGameTemplate.js:291`) |
| P0-03 | Caption | Start Caption (or press Next/Change Question) while no playing player is connected, e.g. from the playlist or with phones asleep | Error message / no-op | 📖 `playingPlayers[x % 0].id` throws, and the **server crashes** | P0 | `server/game/dtGame.js:691-693` has no empty guard. `caption:start` has no minimum player count (`:589`) |
| P0-04 | Photo games started with banked photos (Caption, Draw on Friends, Prompt Match), i.e. every 2nd photo game in a playlist | Playlist Draw on Friends → Selfie Captions. After game 1 everyone has a saved selfie; press "▶ Next: Selfie Captions" | Phones go to the caption-writing screen | ✔ The TV shows "Round 1/3 · Captions written 0/3", but **all phones render the Lobby** ("Waiting for host to start…") on URL `/caption-write`. The game can't be played; only Skip Mini Game gets out | P0 | The server skips the photo phase (`dtGame.js:72-76, 630-633, 978-981`), so the first event is `caption:writing_phase` / `selfie:draw_assigned` / `photovote:voting_phase`. Those reducers don't set `state.phase` (`gameStore.jsx:773-786, 1035-1052, 1142-1155`), so it stays `lobby` after `GAME_SWITCHED` and the lobby view renders |

#### P1 — broken feature

| ID | Game/Area | Steps to reproduce | Expected | Actual | Sev | Suspected root cause |
|---|---|---|---|---|---|---|
| P1-01 | Host "Next" (WST, ToT, MLT) | Double-click "Next Answer →" (WST) or "Next Round →" (ToT/MLT) on the TV | Advance once | ✔ WST skips an answer (2× `next_answer`); ✔ ToT jumps from round 1 to round 3; 📖 MLT skips a round. ✔ A **non-host player** emitting `next_answer_request` ends the round | P1 | `server/index.js:1334-1352` (no host check, no expected-index), `:1408-1429` and `:1812-1820` check only `room.phase`. The buttons have no in-flight disable |
| P1-02 | This or That, phones | Play ToT; everyone votes | Phones show the A/B split, majority and score | ✔ Phones stay on "Vote locked in! 🔒 3/3 votes in" until the game ends | P1 | `App.jsx:100` routes `/tot` to `games/this-or-that/PlayerView.jsx`, which never renders `resultsVisible`. The results UI only exists in the unrouted `pages/ThisOrThatPage.jsx` |
| P1-03 | This or That, phones | Tap A, then try to tap B | You can switch before confirming | ✔ Both buttons disable on the first tap; there's no Change button | P1 | `games/this-or-that/PlayerView.jsx:108` `hasVoted={!!vote.pending…}`; `game-core/player/ConfirmVoteCard.jsx:10` ignores `onChange` |
| P1-04 | Rounds setting (WST, Situational, ToT) | TV: create a room, pick 5 (or 8, 10) rounds, Start | 5 rounds | ✔ "ROUND 1 OF 3" | P1 | `HostPage.jsx:3585,3681` emits `start_game` with only `{code}`; the TV never sends `set_game_options`. The server default is `totalRounds: 3` |
| P1-05 | Untimed phases (Caption photo+writing+vote, Photo Vote photo+vote, Selfie photo+vote, DT selfie, Drawing/FITB vote) | One player never submits, or leaves | A timer or a host "continue" moves the game on | 📖 Waits forever. The TV has no skip for these phases (`caption:skip_to_voting`, `photovote:skip_to_results` and `selfie:skip_to_drawing` are handled by the server but never emitted). The only escape is "Skip Mini Game", which abandons the game | P1 | `HostPage.jsx:2485-2551` (props passed at `:4097,:4101` but not rendered); `dtGame.js:651-683, 808-835, 1009-1040`; `CaptionWritePage.jsx:18-63` timer fields never set |
| P1-06 | Caption / Photo Vote end on the TV | Finish all Caption rounds (standalone or in a playlist) | Final scoreboard + Play Again / ▶ Next / New Party Pack | ✔ Caption: TV shows "Round 5/5 · 3 active players" with only "Skip Mini Game". ✔ Photo Vote (Selfie Challenge) inside a playlist: the TV shows only "Play Again / New Party Pack", with **no "▶ Next: Prompt Match" and no Skip Mini Game**, so **the playlist cannot continue**. After a TV reconnect both render blank | P1 | Server never sets `captionEnd`/`photovoteEnd` (`dtGame.js:880,1249`); `HostPage.jsx:2637` end-status list and `renderPanel` don't handle `caption-end`/`photovote-end`; `phaseToStatus` `:2688-2690` |
| P1-07 | Mid-game join (all games; worst in Caption/Photo Vote) | A 4th player joins during round 1 | Either plays from the next round or sits out, and isn't counted | ✔ WST: URL `/question` but the page shows the Lobby; the TV counts them ("ANSWERS SUBMITTED 0/4"); they can vote on `/vote`. 📖 Standalone games count them in thresholds but park them in `/lobby` for the whole game, so rounds wait for the timer or hang (Caption/Photo Vote never clear the flag) | P1 | `server/game/players.js:9` `getActivePlayers` includes `joinedMidRound` while `canonicalRoute.js:19` parks them; flag not cleared in `dtGame.js:589-649, 914-1007`, `index.js:2588-2627` or any `*:next_round` |
| P1-08 | Mixed pack scoring | Mixed game with WST + ToT (+ Drawing) | The final score sums all sub-games | 📖 The final score shows only one of `room.scores` / `tot.scores` / `draw.scores` depending on which game came last; `tot.scores` also leaks across games | P1 | `totGame.js:111-116`, `index.js:374, 1419-1421, 1297-1299, 1368-1370, 981` |
| P1-09 | Draw Telephone | Host presses "End game" during the drawing phase | Everything stops | 📖 Per-chain `setInterval`s keep running and later broadcast `dt:guessing_phase` into the ended game | P1 | `dtGame.js:2039-2078` doesn't clear `chain.timerRef` (`:1390-1415`) |
| P1-10 | Draw Telephone | Submit a prompt (or guess), press "✏️ Edit", change it, Update | The new text is used | 📖 The server rejects the second submit silently ("one prompt per player" / "already guessed"); the UI shows ✓ and the old text is used | P1 | `dtGame.js:1688, 1912` vs the edit UI in `DrawTelPromptPage.jsx:98-106`, `DrawTelGuessPage.jsx:115-121` |
| P1-11 | Host identity (TV + host playing on phone) | Host plays on a phone while the TV is open; the phone or TV reconnects | Both keep working | 📖 The phone reconnect overwrites the TV's `socketId`, so TV controls silently fail. A TV reconnect race loses the phone socket. FITB voting never reaches the TV because `.except()` uses `socketId` | P1 | `roomManager.js:280-284, 401-403`; `index.js:1538-1547, 2417-2418`; `tvSocketId` never set |
| P1-12 | Host migration | Wifi blip drops all sockets; the TV's disconnect is processed last | A host exists after reconnect | 📖 No player has `isHost`; the room can never be advanced | P1 | `roomManager.js:409-417`; rejoin never restores host |
| P1-13 | Rejoin after kick | Host kicks a player; that tab later becomes visible again | Treated as a new visitor | 📖 A stale `playerId` handshake creates a phantom player **plus** a second one; one stays "connected" forever and inflates every "all submitted" count | P1 | `index.js:793-798`; `roomManager.js:319-347, 396`; `useSocket.js:167-171` (kick doesn't clear sessionStorage) |
| P1-14 | Player navigation | Play any game and watch the network | One resync per (re)connect | 📖 Every route change re-runs the `useSocket` effect (its deps include `navigate`, whose identity changes per path in react-router 6.30), which re-emits `join_room` and receives the **whole room including every player's base64 photos**; the restore can clobber `myAnswerIndex` | P1 | `client/src/hooks/useSocket.js:866` deps, `:487-489` |

#### P2 — inconsistency / partially broken

| ID | Game/Area | Steps to reproduce | Expected | Actual | Sev | Suspected root cause |
|---|---|---|---|---|---|---|
| P2-01 | All: disconnect | 3 players; Carl closes the tab; Alice and Bob answer | Phase advances | ✔ Waits the full 30 s timer (Photo phases: forever) | P2 | The `disconnect` handler never re-evaluates thresholds (`index.js:1713-1738`) |
| P2-02 | All: departed submitters | 4 players; P1 submits then leaves; P2, P3 submit; P4 still typing | Wait for P4 | 📖 Advances without P4 (the count includes the departed P1, the expected count excludes them) | P2 | `SubmissionTracker.js:30-35`, `VoteCollector.js:47-52`, hand-rolled counts in `dtGame.js` |
| P2-03 | WST/Situational answered counter | Start a round; refresh a phone | "x / 3 answered" | ✔ Starts at "0 / 4" (counts the TV "Screen Cast" player) and returns to "0 / 4" after a refresh, while the TV shows "1/3" | P2 | `QuestionPage.jsx:201` uses `state.players.length`; `totalPlayers` is 0 until the first `answer_received` |
| P2-04 | TV refresh | Refresh the TV during a WST question | "ROUND 1 OF 3" | ✔ "ROUND 0 OF 0" | P2 | The `spectator_joined` restore (`HostPage.jsx:~3330-3490`) doesn't restore round/total for WST |
| P2-05 | WST/Situational end, phones | Finish a game on a non-host phone | Only the host sees "Play Again" | ✔ Every phone shows "Play Again 🔄"; tapping it does nothing | P2 | `GameEndPage.jsx:25` `isHost={true}` |
| P2-06 | FITB end, phones | Finish FITB | All phones show Game Over | ✔ One phone stays on the last round's "Results!" while the others show Game Over (2 of 2 runs) | P2 | Reaching `/fitb-end` depends on navigation timing: `fitb:results`, then `fitb:end` arriving before the navigate settles (`useSocket.js:332-341`) |
| P2-07 | Photo Vote end, phones | Finish Selfie Challenge / Prompt Match | Phones show the final scoreboard, as in other games | ✔ Phones stay on `/photo-vote-results` "Final Results! … Waiting for host…" | P2 | No end route; `photovote:game_over` is handled in place |
| P2-08 | Long text (all text games) | Answer with 150 chars without spaces | Wraps inside the card | ✔ Overflows off-screen on the phone vote screen and the TV card | P2 | No `break-words`/`overflow-wrap:anywhere` on answer cards (`VotingPage.jsx`, `HostPage.jsx` VotingPanel) |
| P2-09 | Empty answers | Type "   " (or nothing) and press Submit (WST, FITB) | Submit disabled | ✔ Submit enabled; the server stores `''` for WST | P2 | `QuestionPage`/`FillBlankPage` pass `disableConfirm={false}`; `index.js:1204` doesn't reject empty text |
| P2-10 | 360 px overlaps | MLT vote on a 360×740 phone; any game header | Everything reachable | ✔ The floating "ROOM XXXX" badge covers the right half of **Confirm**. ✔ The Lang/Sound pill overlaps "ROUND 1 OF 5" and "ANSWER 1 OF 3 ⏳". ✔ On the 1280 px TV the pill overlaps "🏠 Main Menu" | P2 | `App.jsx:154` RoomCodeBadge `fixed bottom-4 end-4`; toggles `fixed top-4`; `PlayerGameLayout.jsx:8`, `VotingPage.jsx:70`, `SituationalVotingPage.jsx:54` lack a top offset |
| P2-11 | Drawing fullscreen, mobile | Drawing: tap ⤢ fullscreen at 360 px | Submit reachable | ✔ Only the toolbar is shown; there is no Submit button in fullscreen. 📖 DT: after auto-submit in fullscreen the whole container, including the exit button, is `pointer-events-none` | P2 | `DrawingPage.jsx` fullscreen branch; `DrawTelDrawPage.jsx:365-400` |
| P2-12 | WST/Situational answer timer | Open a question on a phone | One timer | ✔ Two timers (ring at the top + "⏳ 29s") | P2 | `App.jsx:140` GlobalTimerOverlay `hiddenPhases` lacks `question`; `QuestionPage.jsx:122-126` |
| P2-13 | Stale timer | WST: everyone votes before the timer ends, then round-end | No timer | 📖 A frozen ring stays on the round-end screen (and in the next Mixed ToT round) | P2 | The server cancels without a 0-tick (`index.js:1327,1338`); `SET_ROUND_ENDED` doesn't clear `phaseTimer` |
| P2-14 | Unconfirmed vote at 0 s (WST, Sit, MLT, ToT, FITB) | Tap a choice, don't confirm, let time run out | The pending pick is submitted (the WST code intends this) | 📖 Lost; the auto-vote effect can never fire | P2 | `VotingPage.jsx:34` needs `timerActive && secondsLeft<=0`, but `gameStore.jsx:999-1006` sets `active: secondsLeft>0` |
| P2-15 | Answer box after submit | Submit, then keep typing (WST) or press Enter (FITB) | Input locks, or edits are saved | 📖 WST: typed text is silently discarded. FITB: Enter re-emits `fitb:answer` | P2 | `components/MiniGameWrapper.jsx:38-39` children always editable; `useMiniGameLifecycle` `confirm()` has no guard; `FillBlankPage.jsx:154` |
| P2-16 | Vote confirm card (all 9 voting pages) | Tap a choice | Summary + "✓ Confirm" + "← Change", translated | ✔ Only "✓ Confirm" (English); `vote/onChange/titleLabel/changeLabel` props ignored | P2 | `game-core/player/ConfirmVoteCard.jsx:10` |
| P2-17 | i18n | Switch to עברית / Français | Fully translated | 📖 FITB, ToT player, Selfie, Caption, Photo Vote, DT, the whole TV (`HostPage.jsx`, 0 translation references), `VoteLocked`, `MiniGameWrapper`, `GameEndShell`, `ConnectionOverlay` and hard-coded "✓ Confirm" are English | P2 | Missing `fitb/selfie/caption/photoVote` namespaces in `locales/translations.js`; literals e.g. `FillBlankPage.jsx:128-316`, `FillBlankEndPage.jsx:12-17`, `games/this-or-that/PlayerView.jsx:39,71,73`, `thisOrThat.adapter.js:82-84`, `QuestionPage.jsx:195`, `VotingPage.jsx:201`, `SituationalVotingPage.jsx:80,129`, `GameEndPage.jsx:23`, `VoteLocked.jsx:28`, `MiniGameWrapper.jsx:33,76`, `ConnectionOverlay.jsx:43-47`, `DrawingPage.jsx:316-637` |
| P2-18 | Game naming/icons | Compare the TV picker, playlist builder, "Change Game" menu, phone "Switch Game" | One name/icon/colour per game | ✔ Situational is " Situational" (missing emoji) in one list and "💭 Situational" in another; ToT is ⚡ vs 🆚; Drawing is "Pictionary Battle" / "Sketch It" / "Sketch It!"; `selfie-roast` is "Draw on Friends" / "Selfie Artist"; accents differ | P2 | Four separate lists in `HostPage.jsx` (~1960, 2033, 2096, 3920, 3980) + `GameSwitcher.jsx:5-18` + `config/hostControls.js:22-37` |
| P2-19 | No per-game intro | Start any game or playlist item | Title, rules, icon, countdown, ready list | ✔ Round 1 starts immediately on every game | P2 | Not implemented; `t.<game>.gameDesc` strings exist but are unused |
| P2-20 | No playlist final scoreboard | Finish a playlist | Cumulative scoreboard on the TV | 📖 The TV shows only the last game's end panel; cumulative scores appear only in the phone lobby | P2 | HostPage never listens for `global_scores_updated` |
| P2-21 | FITB, phone host | Host plays FITB on a phone; reach results | Next/Skip buttons; non-hosts see "Waiting for host…" | 📖 Handlers defined but never rendered | P2 | `FillBlankPage.jsx:100-118` |
| P2-22 | Selfie vote | Tap a drawing | Highlight + "👆 Selected" | 📖 Never highlights (a local `selected` shadows the state) | P2 | `SelfieVotePage.jsx:56,62,64,86` |
| P2-23 | Draw on Friends rounds | Finish round 1 of 3 | Round results + Next Round | 📖 The "final results" page with confetti and the game-end sound appears every round; the phone host's "Play Again" restarts mid-game | P2 | `SelfieResultsPage.jsx:40,59,100-116`; `gameStore.jsx:864-875` |
| P2-24 | Selfie fullscreen submit | Fullscreen, 0 strokes, "Submit ✓" | Disabled | 📖 Submits an empty drawing | P2 | `SelfieDrawPage.jsx:259-264` |
| P2-25 | Long strokes | Draw one stroke of more than 300 samples | Everyone sees the full stroke | 📖 The server silently truncates to 300 points/stroke and 500 strokes; there's no client guard for the 3 MB socket limit | P2 | `server/game/limits.js:12-27`; `index.js:220` |
| P2-26 | DT guess, 360 px | Open the guess screen | Whole drawing visible | 📖 About 22% cropped | P2 | `DrawTelGuessPage.jsx:98-103` (`cssWidth={400}`) |
| P2-27 | Selfie retake | Mid-drawing, "📷 Retake Photo" | Return to your drawing | 📖 The drawing is lost (no stroke autosave) | P2 | `SelfieDrawPage.jsx:33,147-150` |
| P2-28 | DT pause | Pause with 10 s left, resume | 10 s | 📖 Every chain restarts at 45 s | P2 | `dtGame.js:1387, 2130-2132` |
| P2-29 | TV timers/status for DT and Caption | Pause DT prompting; players write captions | TV ring pauses; bubbles update | 📖 The DT TV countdown is a local `setInterval` and ignores pause. Caption writing bubbles never update (payload key mismatch). FITB counters read `totalAnswerers` (undefined) | P2 | `HostPage.jsx:1156-1184, 3074-3075, 3132-3135`; `dtGame.js:737`; `index.js:2376` |
| P2-30 | Missing TV controls | Try to pause ToT or Selfie, skip DT to reveal, or skip Drawing to vote from the TV | Available (the server supports them) | 📖 Not rendered | P2 | `HostPage.jsx:2289-2670` (`onDrawSkipToVote` `:4076`); `dtGame.js:372-388, 2080` |
| P2-31 | Host takeover | Open `/host?room=CODE` on any device | Spectator only | 📖 Gets full host powers (kick, skip, reset scores) | P2 | `index.js:1528-1547` `join_spectator` has no auth |
| P2-32 | Host migration policy / TV listeners | Host blips for 2 s | Grace period; TV reflects disconnects | 📖 Host migrates immediately (possibly to a cast device) and never returns. The TV ignores `host_changed`, `player_disconnected` and `player_reconnected` | P2 | `roomManager.js:409-417`; `HostPage.jsx` (no listeners) |
| P2-33 | Minimum players | Start with 2 connected + 1 disconnected, or reach a playlist item that needs more | Clear error | 📖 The client requires 3 (counting disconnected players). The server requires 3/2/0 depending on the game and **returns silently**; the TV sits on "Connecting…" | P2 | `index.js:966,1753,1975,2303`; `dtGame.js:46,589,914,935,1612`; `LobbyPage.jsx:62` |
| P2-34 | Phone-lobby start | Host (migrated to a phone) picks Prompt Match or FITB and presses Start | That game starts | 📖 Starts Who Said That | P2 | `LobbyPage.jsx:61-89` missing branches; `start_game` doesn't validate `gameType` |
| P2-35 | Room eviction | Play ToT/Caption/DT for >60 min | Room stays alive | 📖 Evicted while players are connected (those handlers never `touchRoom`). Timers aren't cancelled and `rooms.json` keeps the room | P2 | `roomManager.js:238-270` |
| P2-36 | Data exposure | Any resync (every visibility change, every screen mismatch) | Only what the screen needs | 📖 `join_success` sends the whole room: answer authorship during voting, all base64 photos | P2 | `TimerManager.js:141-163` `sanitizeRoomForClient` |
| P2-37 | Rejoin state, ToT | Refresh after voting or on results | "Voted" / results | 📖 Active buttons again; a second vote is silently dropped | P2 | `client/src/utils/rejoinState.js:192-205` |
| P2-38 | Restart recovery (timers) | Restart during FITB/WST answering, MLT voting, selfie drawing, DT | Timers resume | 📖 Only draw, ToT, sit-voting and WST voting resume | P2 | `index.js:685-726` |
| P2-39 | Drawing, secret mode | Submit, then skip word | Must redraw | 📖 Voting starts without the deleted drawing | P2 | `index.js:2042-2061` vs `SubmissionTracker` |
| P2-40 | Caption, voting | Re-submit a caption during voting | Locked | 📖 Accepted; edits text voters already saw; a newcomer's caption appears in results but not on the ballot | P2 | `dtGame.js:718-733` |
| P2-41 | DT offline player | A player leaves during drawing | Turns skipped | 📖 Each of their turns costs 45 s, serially | P2 | `dtGame.js:1383-1466` |
| P2-42 | MLT self-vote option | Turn off "allow self-vote" | Self-votes rejected | 📖 Always allowed | P2 | `index.js:1783`, `mltGame.js:176` (see Q3) |
| P2-43 | Options / rounds validation | `set_game_options` with more rounds than questions | Clamp | 📖 Rounds silently do nothing until the counter runs out; options are unvalidated; a host on `phoneSocketId` can't change options | P2 | `index.js:571, 1362-1365`; `roomManager.js:428-432` |
| P2-44 | React render loop (phone) | Playlist Drawing → Draw on Friends on a 360 px phone | No errors | ✔ `Maximum update depth exceeded` logged once on one phone, during Drawing or the start of Draw on Friends (before the first photo upload). The page kept working | P2 | Not yet isolated: a `setState` in an effect with a dependency that changes every render (candidates: `DrawingPage`, `SelfieDrawPage`, `usePhaseSync`). Needs a focused repro |

#### P3 — polish

| ID | Game/Area | Steps to reproduce | Expected | Actual | Sev | Suspected root cause |
|---|---|---|---|---|---|---|
| P3-01 | Draft on refresh | Type an answer (don't submit), refresh | Draft kept | ✔ Lost | P3 | Draft not in sessionStorage (QuestionPage) |
| P3-02 | Playlist label | Finish a game in a playlist | "▶ Next: Who Said That?" | ✔ "▶ Next: who-said-that" | P3 | `QUEUE_GAME_LABELS` (`config/hostControls.js`) missing entries |
| P3-03 | Console | Open the TV during FITB/Selfie | Clean console | ✔ Missing `key` warning in `FitbHostPanel`, `SelfieHostPanel` | P3 | `HostPage.jsx` list renders |
| P3-04 | Console | Photo games without storage | Silent fallback | ✔ 503 `/api/upload-url` logged as an error each time | P3 | `index.js:168`; `photoUpload.js` |
| P3-05 | Console | Any page | Clean | ✔ React Router v7 future-flag warnings | P3 | `App.jsx` router config |
| P3-06 | MLT joker | Activate the joker, then host Change Question | 2 left | 📖 Shows 1 left | P3 | `index.js:1865, 1881-1887` |
| P3-07 | MLT pending pick | Select a player, then host Change Question | Selection cleared | 📖 Kept | P3 | `games/most-likely-to/PlayerView.jsx:118` |
| P3-08 | Pause feedback | Pause during a text-timer phase | ⏸ shown | 📖 Numbers freeze silently | P3 | QuestionPage/VotingPage/SituationalVotingPage/FillBlankPage timers |
| P3-09 | RTL | Hebrew | Mirrored | 📖 Physical `left/right/ml/mr/space-x` classes in ~15 places | P3 | `VotingPage.jsx:74`, `RoundEndPage.jsx:27,38,54`, `SituationalVotingPage.jsx:156`, `games/most-likely-to/PlayerView.jsx:39`, `FillBlankPage.jsx:198-294`, `CaptionVotePage.jsx:65,75-76`, `Leaderboard.jsx` slide-in from x:-30 |
| P3-10 | MLT end | Finish MLT | Confetti once | 📖 Loops forever | P3 | `MostLikelyToEndPage.jsx:54` |
| P3-11 | Caption / Photo Vote host button | Last round results | "Finish" | 📖 "Next Round (4/3)" | P3 | `CaptionResultsPage.jsx:89`; `PhotoVoteResultsPage.jsx:85` |
| P3-12 | Caption / Photo Vote scoreboard | Someone scores 0 | Listed | 📖 Omitted | P3 | `dtGame.js:845-846, 1200-1210` |
| P3-13 | Drawing auto-submit | Timer ends | One submit | 📖 Up to 3 identical emits | P3 | `DrawingPage.jsx:227-233` |
| P3-14 | Canvas details | Tap a dot (DT/Selfie); vote thumbnails; DT toolbar at 360 px | Consistent | 📖 Dots dropped/not painted; 4:3 thumbnails squashed; swatches squeezed to ovals | P3 | `DrawTelDrawPage.jsx:152-155, 406-431`; `DrawingPage.jsx:484` |
| P3-15 | TV socket leak | Leave `/host` after creating a room | Socket closed | 📖 The creator socket stays connected with ~100 listeners | P3 | `HostPage.jsx:3511-3562` |
| P3-16 | Photo submit feedback | Server rejects a photo | Error + retry | 📖 "Photo submitted ✓" forever (no ack); upload fetch has no timeout | P3 | `SelfiePhotoPage.jsx:16-22`; `photoUpload.js:36-56` |
| P3-17 | Misc server validation | Invalid `sit:vote` / `mlt:vote` target; NaN rounds; a vote after the WST reveal; stale drafts; DT votes for another chain; pmatch Change Question skips a prompt | Rejected/clamped | 📖 Accepted | P3 | `index.js:1244-1250, 1799` (targets); `dtGame.js:604-614, 951-963` (NaN); `index.js:1303-1321` (post-reveal vote); `index.js:512, 1200-1201` (drafts not reset); `dtGame.js:1996-2036` (DT votes); `dtGame.js:1064-1067, 1135-1141` (pmatch index) |
| P3-18 | Server hygiene | eventLog keyed by arbitrary codes; unlimited custom questions; persistence debounce starvation; host can kick themselves; 1-3 character room codes; selfie self-assignment fallback | — | 📖 | P3 | `index.js:779-786` + `eventLog.js:36-45`; `index.js:945-956`; `persistence.js:94-99`; `index.js:1160-1177`; `roomManager.js:14`; `dtGame.js:213-226` |
| P3-19 | Dead code | — | — | 📖 `ThisOrThatPage`, `TotPanel`, `buildHostControls` (unused), `GameRoundShell`, `ActionController` + `actions/*`, `VotingArea`, `AnimatedPage`, `components/game/MiniGameWrapper`, trivia/drawing adapters, `PHASE_TIMER_STOP` | P3 | Leftovers from the game-core refactor; risk of fixing the wrong copy |
| P3-20 | Adapter contract | Use ToT `togglePause` | Toggles | 📖 Always pauses | P3 | `thisOrThat.adapter.js:49-54` |
| P3-21 | Skip Mini Game lock | Skip while reconnecting | Buttons recover | 📖 `isTransitioning` stuck | P3 | `HostPage.jsx:3628, 3656-3659` |

**Not reproduced:** a static-review finding said "Selfie can't be played past round 1" and rated it P0. At runtime all three phones returned to `/selfie-draw` for rounds 2 and 3 using banked photos. The reducer does set `phase:'selfieEnd'` on every `selfie:results` (`gameStore.jsx:864-867`), which is the cause of P2-23, but `usePhaseSync` didn't redirect in practice. Worth a regression test.

---

## 8. Fix plan (grouped by root cause)

Shared fixes come first. Each bullet is one commit and is re-verified with the Playwright harness.

### Stage 1: server hardening (all games)
1. **Safe socket handlers.** Add a `safeOn(socket, event, handler)` wrapper that defaults the payload to `{}`, validates `code` and catches and logs errors, and apply it to every handler in `index.js` and `dtGame.js`. Add a last-resort `process.on('uncaughtException')` logger. Fixes P0-01, part of P3-17.
2. **Persistence round-trip.** Strip *every* helper object: every `_`-prefixed key on the room and each game slice. Rebuild trackers and collectors on restore. Extend `resumeRoomTimers` to every timed phase. Add a Jest test that serializes and restores a room in every phase. Fixes P0-02, P2-38.
3. **Host-action guard.** Add `requireHost(room, socket)` plus an *expected state* check. Each Next/Skip/Show-results event carries `{round, index}` and the server ignores stale ones. Apply it to every host event. Fixes P1-01 and the host half of P2-31. The client disables advance buttons while a request is in flight.
4. **One definition of "expected participants".** Add `getExpectedPlayers(room)`: playing, connected, not `joinedMidRound`. `SubmissionTracker`/`VoteCollector` count only current expected players. Re-evaluate thresholds on disconnect, kick and join. Clear `joinedMidRound` at every round and game start. Fixes P1-07, P2-01, P2-02, P2-41 and part of P1-13.
5. **Empty-room guards and end phases.** Caption and Photo Vote set `captionEnd` / `photovoteEnd`. Every start handler enforces a registry minimum and replies with an `error` ack. Fixes P0-03, P1-06 (server half), P2-33.
6. **Host identity model.** Store explicit `tvSocketId` and `phoneSocketId`. Add a reconnection grace before host migration and restore the host on rejoin. Clear sessionStorage on kick. Fixes P1-11, P1-12, P1-13, P2-32.

### Stage 2: shared client components and contract
6b. **Phase ownership (P0).** The server includes `phase` in the first event of every game and sub-phase, or emits one generic `phase_changed {phase, gameId}`. The client sets `state.phase` from it, instead of relying on per-game reducers remembering to. Also fix `SELFIE_RESULTS` to respect `isFinal`. Fixes P0-04, and removes the latent version of the Selfie multi-round issue.
7. **Game registry** (`client/src/games/registry.js` + a server mirror). One entry per game: `{id, label, icon, accent, startEvent, minPlayers, routes, endRoute, hasTimerPhases}`. Replace the 4 HostPage lists, `GameSwitcher`, `QUEUE_GAME_LABELS` and the LobbyPage/HostPage start switches. Fixes P2-18, P2-34, P3-02, and supplies the intro data.
8. **`GameIntroCard`**. A server-emitted `game:intro {gameId, startsAt}` shows a 5 s intro on the TV and phones before round 1, including every playlist item. Fixes P2-19.
9. **Timer.** Use `TimerRing` + `useRoundTimerSync` everywhere. Remove or limit `GlobalTimerOverlay`. Clear the timer on phase end. Show ⏸ when paused. Use proportional thresholds. Fixes P2-12, P2-13, P3-08, part of P2-29.
10. **Confirm flow.** Fix `ConfirmVoteCard` so it renders the summary, Change and i18n. Move every vote page to `useVoteConfirmation`. Auto-submit the pending pick at 0. Fixes P1-03, P2-14, P2-16.
11. **Text input flow.** In `MiniGameWrapper`: trim, disable when empty, lock the input after confirm, guard `confirm()` against re-entry, keep the draft in sessionStorage. Fixes P2-09, P2-15, P3-01.
12. **Layout.** `PlayerGameLayout` gets a top safe area and the room badge moves into the header. Add `break-words` on user content, container-sized canvases, and a Submit button in fullscreen. Fixes P2-08, P2-10, P2-11, P2-26, P3-14.
13. **End screens + playlist.** `GameEndShell` everywhere with the correct `isHost`. Consistent end routes (FITB, Photo Vote, Selfie). The TV end controls cover every end status. Add a playlist scoreboard from `globalScores`. Fixes P1-06 (client half), P2-05, P2-06, P2-07, P2-20, P2-23.
14. **Host control bar.** Render the (now used) `buildHostControls` config. Every phase gets an Advance/Skip, and the server-supported pause and skip controls get buttons. Fixes P1-05 (client half), P2-29, P2-30.
15. **`useSocket` effect deps.** Keep `navigate` in a ref so listeners aren't re-attached and `join_room` isn't re-sent on every navigation. Fixes P1-14.
16. **Rounds.** The TV sends `rounds` with `start_game`, or emits `set_game_options` first. Fixes P1-04.

### Stage 3: per-game fixes that remain after the shared work
17. **ToT PlayerView results screen.** Port it from the dead `ThisOrThatPage`, then delete that page. Fixes P1-02.
18. **Timers for untimed phases.** Photo phases (Caption, Photo Vote, Selfie, DT selfie), Caption writing, and the Caption/Photo Vote/Drawing/FITB/Selfie votes. Room `roundDurationSecs` is used for inputs, a fixed 30 s for votes. Fixes P1-05 (with item 14).
19. **Draw Telephone.** Clear chain timers on end. Allow editing the prompt/guess until the phase closes (Q2). Keep remaining seconds on pause. Skip turns of offline players. Fixes P1-09, P1-10, P2-28, P2-41.
20. **Mixed scoring merge.** Fixes P1-08.
21. **Selfie.** Vote highlight, fullscreen submit disabled when empty, stroke autosave on retake. Fixes P2-22, P2-24, P2-27.
22. **Remaining P2/P3.** Caption edit lock, secret-word skip, snapshot data trimming (P2-36), ToT rejoin state, joker count, i18n namespaces (P2-17), RTL logical classes (P3-09), dead-code removal (P3-19).

**Verification.** The Playwright harness used for this audit (1 TV + 3 phones at 360 px, per-game autoplay, lifecycle scenarios, socket fuzz) will be added under `tests/audit/` in the first fix PR. Each fix commit re-runs the affected scenario.

---

## 9. Open questions

1. **Change-answer rule.** Is the proposed rule OK? Free until Confirm; text and drawing editable until the phase closes; votes final after Confirm.
2. **Draw Telephone edits.** Should prompts and guesses be editable until the phase closes, as the UI suggests, or should the "Edit" buttons be removed?
3. **MLT self-vote.** Always allowed today. Should the lobby "allow self-vote" toggle control it?
4. **Mid-game joiners.** Should they join at the next round (WST/MLT behaviour) or sit out the whole mini-game? Either way they must not count towards "everyone answered".
5. **Host role after a blip.** Should the TV always be the host (and never migrate), with a phone host only when there's no TV?
6. **Mixed scoring.** Should the final score be the sum of the WST/Sit + ToT + Drawing points?
7. **Minimum players.** Is 3 for every game right? Caption and Photo Vote currently have no minimum, and MLT/Drawing/FITB/Selfie accept 2.
8. **WST voting at 0 s.** Should the per-answer voting timer auto-advance to the next answer, or is host pacing intended? Today it only reveals the author.
9. **Placeholder answers.** When a player doesn't answer, the server inserts "Didn't have time to think of something funny." (or `'...'`), which can put several identical answers on the vote screen. Keep this, or exclude non-answers from voting?
10. **Caption photo owner.** The code comment says the owner can't write a caption on their own photo, but the server requires it and scores it. Which is intended?
11. **Selfie per-round results.** Should Draw on Friends show a round-results screen (like the other games) with a separate final screen?
12. **Intro screen gating.** Should the intro auto-start after a countdown, or wait for "ready" from every phone (with a host override)?
13. **Photo Vote targets.** Votes for players without a photo, or who are disconnected, are accepted. Is that allowed?

---

## 10. Fix log

Status of each finding as it is fixed (Phase 4). "Verified by" names the scenario that was re-run against the running app.

| ID | Status | Commit | Verified by |
|---|---|---|---|
| P0-01 | ✅ fixed | 8d6b230 | Socket fuzz: 23 events × 4 payload shapes (none, null, string, wrong types); server stays up, errors logged |
| P0-02 | ✅ fixed | 88b841f | WST question → server restart → rejoin → submit answer: accepted, no error. Jest: helpers stripped on save/restore, MLT template rehydrates |
| P0-03 | ✅ fixed | 248f3e0 | `caption:start` / `photovote:start` / `start_game` / `mlt:start` / `dt:start` with 1 player → `game:start_rejected` with a reason (TV toast, back to lobby); caption owner picked among players with photos |
| P1-06 | ✅ fixed | 248f3e0 | Full Caption game → TV "Game Over!" + Play Again / ▶ Next / New Party Pack; Photo Vote the same |
| P0-04 | ✅ fixed | ae13219 | Playlist Selfie Challenge → Selfie Captions (photos banked): phones go straight to `/caption-write` and play |
| P3-12 | ✅ fixed | 248f3e0 | Caption / Photo Vote final boards include 0-point players |
| P1-01 | ✅ fixed | f0f1ed5 | Socket double `next_answer_request` → one advance; player-sent advance ignored; TV double-click on ToT Next Round → round 2 (was 3) |
| P1-04 | ✅ fixed | e5d187b | Pick 5 rounds on the TV → "ROUND 1 OF 5" for WST, ToT, Situational |
| P1-07 | ✅ fixed | 00d63c8 | Late joiner waits in the lobby (TV 0/3), is admitted at round 2 (TV x/4) and their answer counts |
| P2-01 | ✅ fixed | 00d63c8 | Tab closed while pending → voting starts 0.2 s later (was: full timer) |
| P2-02 | ✅ fixed | 00d63c8 | Jest: a submitter who left can't complete the phase for someone still typing |
| P1-14 | ✅ fixed | 9fb082e | WST game: `join_room` re-sends per phone 12 → 0 (145 KB of snapshots saved) |
| P1-09 | ✅ fixed | 19eb7d4 | End game during DT drawing → only `dt:end` arrives afterwards |
| P1-10 | ✅ fixed (guesses editable, prompts final — per Q2) | 19eb7d4 | Edited guess shown in the reveal; prompt page no longer offers a no-op Edit |
| P2-28 | ✅ fixed | 19eb7d4 | DT pause at 41 s resumes at 40 s (was 45) |
| P1-08 | ✅ fixed | 959d872 | Mixed WST + ToT → final 3 + 2 = 5 |
| P2-20 | ✅ fixed | 959d872 | Playlist MLT → ToT: "Party Totals" then "Final Party Scoreboard" with Reset points (Q6) |
| P1-05 | ✅ fixed | d1bf0b1 | Caption: Continue from photo (2/3 photos) → writing → voting; unvoted round ends after 30 s; pause freezes; TV shows countdown + Pause + Continue |
| P1-11 | ✅ fixed | 98ee2b2 | Host identity by key + `tvSocketId`; TV refresh keeps control |
| P1-12 | ✅ fixed | 98ee2b2 | Jest: hostless room gets a host on the next (re)join |
| P1-13 | ✅ fixed | 98ee2b2 | Stale handshake ids no longer create players; kick clears the session |
| P2-31 | ✅ fixed | 98ee2b2 | `/host?room=CODE` without the key is view-only (no Start); key never in snapshots |
| P2-32 | ✅ fixed | 98ee2b2 | TV dropped → phone host after 45 s, can start the game; TV back with key → host again |
| P2-34 | ✅ fixed | 98ee2b2 | Phone lobby start covers Prompt Match / Fill in the Blank |
| Q4 | ✅ implemented | 98ee2b2 | "No TV? Host on this phone" → full WST game played with no TV; "Show on a TV" link in the phone host's lobby |
| New: lobby URL rewrite | ✅ fixed | 00d63c8 | `LobbyPage` no longer replaces the URL with `/?join=CODE` (a refresh in the lobby used to wipe the session) |
| New: stuck exit animation | ✅ fixed | 00d63c8 | `AnimatePresence mode="wait"` removed; a late joiner no longer sees the previous page under the new URL |
| P3-18 (self-kick) | ✅ fixed | 00d63c8 | Host can't kick themselves |
| **Stage 2 — shared components & contract** | | | |
| P2-18, P3-02 | ✅ fixed | 0d0ddf3 | Game registry: all 12 game types start from the TV picker; names/icons consistent; "▶ Next:" shows names |
| P2-10 | ✅ fixed | 6fc2e0c | 360 px: top bar (room · timer · sound/lang) in flow — Confirm no longer covered; TV header no longer overlaps Main Menu |
| P2-13 | ✅ fixed | 6fc2e0c | Timer that stops ticking disappears after 2.5 s; results/end events clear it at once (6a89fbe) |
| Waiting state | ✅ added | 565c1ce | WST: "Waiting for Bob, Carl" → "Waiting for Carl" |
| P2-09 | ✅ fixed | 3b2a05d | Whitespace answer → Submit disabled (WST, FITB); server refuses blank answers |
| P2-15 | ✅ fixed | 3b2a05d | Input locked after Submit, Edit unlocks; Enter can't re-submit |
| P2-16 | ✅ fixed | 3b2a05d | ConfirmVoteCard shows the pick + ← Change, translated |
| P2-19 | ✅ fixed | dfb6222 | Every game starts with the intro: rules, I'm ready, 2/3 ready on TV, 3-2-1, host "Start now" |
| P2-05 | ✅ fixed | 79910b2 | WST game over: phones show "Waiting for the host…", no Play Again; Main Menu leaves the room |
| **Stage 3 — per-game migration** | | | |
| P2-03, P2-08, P2-14 | ✅ fixed | eced7af | WST: "0 / 3 → 1 / 3 answered"; long answers wrap (phone + TV); unconfirmed pick submitted at the timer's end |
| P2-12 | ✅ fixed | eced7af … ed983c7 | One timer on every screen (shell) — page timers removed game by game |
| Situational author leak (new) | ✅ fixed | 746055c | Confirm card showed the author's name for an anonymous answer; now shows the answer text |
| P3-06, P3-07, P3-10 | ✅ fixed | ed65a1f | Joker 1 left → Change Question → 2 left; stale pick cleared; MLT end on shared shell (confetti once) |
| P1-02, P1-03, P2-37 | ✅ fixed | 6a89fbe | ToT: switch A→B before Confirm; results on phones; refresh restores vote/results |
| P2-06, P2-17 (FITB), P2-21, P3-03 | ✅ fixed | 71908cf | Full FITB game: all phones on Game Over; phone host Next Round; FITB translated; key warning gone |
| TV stale Continue (new) | ✅ fixed | 71908cf | After results the TV no longer shows a countdown with a dead Continue |
| P2-11 (Drawing), P3-13, P3-14 | ✅ fixed | 4293f93 | Fullscreen Submit used in a full Drawing game; one auto-submit; 4:3 vote thumbnails |
| P2-39 | ✅ fixed | 03c9e5d | Jest: removed submission must be redrawn before voting |
| P2-11 (DT), P2-26, P2-29 | ✅ fixed | b727174 | Full DT game; fullscreen exits after submit; guess canvas scales; TV DT timers follow the server |
| P2-22, P2-23, P2-24, P2-27 | ✅ fixed | a96e298 | 3-round Draw on Friends: round results between rounds, shared Game Over at the end |
| P3-11, P3-12 | ✅ fixed | ed983c7 | Caption: Next Round / Finish labels; final board lists every player |
| P2-07 | ✅ fixed | d62ddd4 | Photo playlist MLT → Selfie Challenge → Prompt Match → This or That: every phone ends on the shared end screen; "▶ Next" after Photo Vote |
| P2-35, P3-18 (saves) | ✅ fixed | 831aa96 | Every room event touches the room; saves within 4 s under load; idle sweep skips rooms with connected players (jest) |
| Intro after restart (new) | ✅ fixed | 4cf3842 | A countdown restored after a restart relaunches (found when a restart froze an intro) |
| P2-40, P2-43, P3-17, P3-18 | ✅ fixed | d8889df | Caption locked in voting; WST late/unknown votes ignored; drafts reset per question; Sit/MLT/DT vote targets validated; custom questions capped; 4-char codes; rounds clamped |
| P3-05, P3-15, P3-20, P3-21 | ✅ fixed | 7c93973 | Title "Party Pack — Who Said That?"; router warnings gone; ToT pause toggles; TV socket closed on unmount; transition lock released |
| P2-03 (after refresh) | ✅ fixed | 5f2960c | Regression test: refresh → "1 / 3 answered" |
| P2-33 | ✅ fixed | 248f3e0 | Server enforces 3 *connected* players for every start (incl. playlist items) and tells the host why (`game:start_rejected`) |
| P3-08 | ✅ fixed | 6fc2e0c | The shell timer shows the paused state for every game |
| Selfie TV end (new) | ✅ fixed | fab5d6b | Found by the regression suite: the TV's final Draw on Friends screen read "Results — Round 3/3"; now "🎉 Game Over! — Final Results" |
| P2-17 (photo games, DT) | ✅ fixed | 1bbdfa7 | Selfie / Caption / Photo Vote / Draw Telephone / connection overlay strings translated (en/fr/he) |
| **Phase 5 — regression safety net** | | | |
| Suite | ✅ added | (see below) | `npm run test:regression`: happy path per game (11), playlist of every game, refresh / leave / late join / TV refresh / phone host, timer expiry, server robustness |

### 10.1 Remaining / open items

Not fixed on this branch — none blocks a game from being played start to finish.

| ID | Status | Note |
|----|--------|------|
| P2-42 | ❓ open question | MLT "allow self-vote" option: self-votes are always allowed. Needs a product decision (keep the option, or remove it). |
| P2-44 | ⚠ not reproduced | `Maximum update depth exceeded` seen once on one phone in a playlist; not seen again in any later full run. |
| P2-38 | ◐ partial | Draw, ToT and voting timers resume after a restart (as before); other phases do not restart their timer, but the TV's ⏭ Continue (now on every timed phase) moves them on. |
| P2-04 | ⏳ not re-tested | TV refresh keeps host control (regression test); the WST "Round x of y" restore was not re-checked. |
| P2-25 | ⏳ todo | No client guard for very long strokes (server silently truncates at 300 points / 500 strokes). |
| P2-30 | ◐ partial | TV now has Pause + Continue for every timed phase; dedicated "skip to reveal" (DT) buttons are not added. |
| P2-36 | ⏳ todo | `join_success` / resync still sends the full room (answer authorship during voting, player photo bank). The host key is stripped. |
| P2-41 | ⏳ todo | A DT player who leaves still costs one turn timer per chain step. |
| P3-01, P3-04, P3-09, P3-16 | ⏳ todo | Draft kept on refresh; silent 503 without storage; RTL logical classes; photo submit ack. |
| P3-19 | ⏳ todo | Dead code (ThisOrThatPage, GameRoundShell, ActionController, VotingArea, AnimatedPage, old MiniGameWrapper, `config/hostControls.js`, TotPanel) — left in place; removal needs its own careful pass with the tests. |
| TV i18n | ⏳ todo | The TV (HostPage) is still mostly English; phones are translated. |
