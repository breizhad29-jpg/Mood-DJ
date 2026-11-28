# Mood DJ for YouTube Music — User guide

A Chrome extension that turns YouTube Music into your own radio station: moods, an energy curve, crossfades, an equalizer, and hosts who talk between the tracks.

Full changelog, in French: [LISEZMOI.txt](LISEZMOI.txt) · Legal notice, privacy, sources and credits: [legal.en.html](legal.en.html)

Up to date with version 2.43.1.

---

## 1. Installation and updating

### Install

1. Unzip the download. You get a `mood-dj` folder. Keep it somewhere permanent: Chrome uses it directly.
2. In Chrome, open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `mood-dj` folder.
4. Pin the extension (puzzle icon, then the pin) so the red vinyl icon is always at hand.
5. Open or reload [music.youtube.com](https://music.youtube.com).

### Update without losing anything (keys, settings, discoveries)

1. In `chrome://extensions`, open Mood DJ's **Details** and note the **Source** line: that is the folder Chrome uses.
2. Unzip the new version somewhere else, then copy the *contents* of the new `mood-dj` folder (`manifest.json`, `content.js`…) into that folder, replacing the files. Don't create a `mood-dj` folder inside `mood-dj`: Chrome would keep the old version.
3. Click Mood DJ's reload arrow in `chrome://extensions`, then reload the YouTube Music tab (F5).
4. Check that the Mood DJ card shows the new version number.

Good to know:

- Don't load the new folder *in addition to* the old one: two copies of Mood DJ would fight over playback. Mood DJ shows a warning if it detects this.
- If you remove the extension and load it again from another folder, you will have to paste your API keys again.
- After some updates, Chrome may ask you to allow new sites or permissions.

---

## 2. Getting started

### The panel and the remote

- A round red Mood DJ button appears at the bottom right of YouTube Music: it opens the panel.
- The extension icon in Chrome's toolbar opens the **remote**: the same playback controls from any tab, plus **Show panel** and **API keys**.
- The four-corner button at the top of the panel (next to the cross) switches to **Full page**: Mood DJ fills YouTube Music's content area, and its tabs spread out in columns. The same button takes you **Back to side panel**. Your choice is remembered.
- In full page, YouTube Music's own player bar is hidden and Mood DJ's mini-player becomes a bar. To keep YouTube Music's bar: Settings › Playback and library › **Hide the YouTube Music player on full pages**.
- The mini-player shows the track, time bar, previous / play-pause / next, volume, **Like** (heart), **Dislike** (thumb down) and **Mix from this track** (the waves icon, left of the thumb).

The panel has five tabs: **Vibe**, **Now playing**, **Sound**, **Settings** and **History**.

### Choosing a mood (Vibe tab)

- **Style**: tap one or several styles to mix them (tap again to remove). Each chosen style has its own row of sub-styles; you can light up several. A style with no sub-style selected is taken whole. **All styles** is also available.
- **Moment**: Wake-up, Quiet morning, Focus, Work, Housework, Road trip, Workout, Meal, Happy hour, Evening party, Party, Stroll / walk, Relaxation, Meditation, Bedtime. Each moment has its own energy curve and typical length.
- **Mood** (optional): Joyful, Romantic, Melancholic, Nostalgic, Danceable, Motivating, Angry, Dreamy, Sensual, Epic, Sunny / summery, Comforting, Dark / mysterious, Quirky.
- **Era** (optional): tap several decades to mix them. **All** clears the choice. **Current** stays on its own: it pulls from YouTube Music's new-release playlists.
- **Energy**: shifts the whole curve up or down.

### Energy curve

- Grab the **Energy curve** anywhere and drag it up or down; the surrounding area follows smoothly. Slide sideways without letting go to redraw it.
- **Brush** (Fine, Medium, Wide) sets how wide the moving zone is: Fine for a detail, Wide for a big wave.
- **Moment curve** restores the original curve (choosing another moment does too).
- Time marks under the curve: small at the quarter hour, medium at the half hour, large at the hour.
- Track energy is an estimate, not a measurement of the sound.

### Playback mode and cycle length

- **Continuous**: Mood DJ keeps a few tracks ahead and follows your changes live. The **Cycle length** (15 min to 4 h, by quarter hours) sets how fast the energy moves: short cycle, quick changes; long cycle, gradual ones. **Auto** uses the length planned for the moment. You can change it before starting or from Now playing.
- **Fixed selection**: choose a length, or **Until a set time**. The energy curve spreads over the whole length. The length is a target: the selection ends a few minutes before or after, always at the end of a track. **Save as playlist** creates a private playlist in your library.

### Track source

- **All**: the built-in catalog (about 5,150 tracks) plus your discoveries.
- **My Likes**: your liked tracks, filtered by vibe and ordered by the energy curve. You can mix in tracks from close artists (1 for 1, 1 for 2 or 1 for 3); they are marked "discovery" in Up next, for you only.
- **Discovery**: none of your Likes or history; with an AI key, less obvious artists and tracks.
- **Similar**: starts from artists that fit the vibe (first from your Likes), explores their "You might also like" on YouTube Music and picks their most-played tracks (no live versions or remixes). **Close artists** or **Further out** (similar artists of similar artists). A discovered artist plays at most twice an hour.
- My Likes and Discovery need you to be signed in to YouTube Music.

### Describe your vibe in words

Type something like "rock for driving at night in the rain" in **Describe your vibe**. The AI builds the selection. This needs a Claude or Gemini key.

### My vibes

- At the top of the Vibe tab, give your settings a name and save them (styles, moment, energy, curve, mood, eras, source, description, mode and length). Up to 40 vibes.
- Pick one from the drop-down menu to load it; the cross next to it deletes it. Saving under a name already used updates that vibe.

### Manage styles

Vibe › Style › **Manage styles**:

- Built-in styles can be removed (they disappear from the choices and their tracks never play, even with All styles) or put back.
- **+ Add a style**: give a name (and details if you like). The AI suggests 3 to 6 sub-styles, the closest sound branding and 60 to 120 real tracks (at most 4 per artist). You see a preview, then **Add this style**, **Start over** or **Undo**.
- An added style works like the others, can be extended (+60 tracks, no duplicates) or deleted. Tracks the AI may have invented simply aren't found on YouTube Music and are skipped.

### Mix from this track

Like what's playing? **Mix from this track** starts a new continuous selection from this artist and close artists, with the same style, sub-style and energy; your moment is kept. The message offers **Save** to keep it in My vibes. In the Vibe tab, an "In the spirit of…" line reminds you of the starting track; its cross goes back to the usual starting artists.

### Changing the vibe during a show

Touching the Vibe tab during a show doesn't change anything right away. A banner appears ("Vibe changed: before → after") with:

- **Update vibe**: after the tracks already announced;
- **From the next track**: without waiting;
- **Cancel changes**: the tab goes back to the show's vibe.

Once applied, a new vibe can still be undone (**Undo**, in the message and in Now playing) as long as it hasn't started. A change to the energy curve alone can be undone for 10 minutes. Requested or dedicated tracks are always kept. A new description, source or fixed selection offers **Restart selection** instead. The hosts announce the change of mood.

### Now playing tab

- **Now playing**: cover, buttons (**Skip**, pause, **Stop**), energy curve, cycle length and **Timer** (the volume fades over the last minute).
- **Up next**: the coming tracks. Remove one with its cross, or use **Regenerate the rest**. Locked tracks (already announced) show "· locked" and won't change.
- It also shows when the next host segment comes, and whether a guest is announced, in the studio or leaving.
- **Never play …** (under the buttons) adds the current artist to the blocklist.
- **Dedications** column: see section 5.

---

## 3. Playback and sound

### Transitions (Sound tab)

- **Fade between tracks**, **Skip silences** and **Tempo**.
- The equalizer, car boost and smooth fades kick in when a selection starts (Chrome needs a click before it lets a page process sound).

### True crossfade

Sound › **True crossfade** (on by default): the two tracks overlap like a DJ mix — the end of the outgoing track fades down while the next one rises.

- YouTube Music only plays one track at a time, so Mood DJ opens a second, embedded YouTube player on the same track 30 s before the end. As YouTube's rules require, this small player (344 × 200 px, with its controls and YouTube logo) is **visible** at the bottom left during the last 30 seconds, then disappears.
- **Close** on that window: usual fade for that track.
- Needs a fade of 3 s or more. No overlap before an interlude, at the end of a selection or timer, or during an ad. When a host talks over the transition, the end fades faster to make room.
- If a track can't be embedded outside YouTube Music, the player isn't in sync in time, or Chrome blocks sound until you've clicked the page, Mood DJ uses the usual fade (the log says "crossfade not possible").
- The second player doesn't go through Mood DJ's equalizer or car boost: for those last seconds the sound may differ slightly.

### Equalizer

- **Equalizer** with a **Setting based on the vibe** (it averages the chosen styles).
- **Car boost**: more bass and presence at medium volume.

### Sound branding (jingles and background beds)

Settings › The show › **Sound branding**:

- **Match the vibe** (default): twelve families, each with its jingle (the same 4-note signature, arranged in the style) and interlude bed: pop, rock, electro, hip-hop, chill / night, jazz, funk / disco, reggae, latino / tropical, Celtic, orchestral, acoustic. The family follows the current style and sub-style. At night, at bedtime and in meditation everything goes soft; dark, melancholic or epic moods switch to minor; energy speeds up the tempo and adds percussion.
- **Classic Mood DJ**: always the same jingle and bed, whatever the music.
- **Listen to the sound branding**: the jingle, then 9 s of bed.
- Voices, jingles and beds follow YouTube Music's volume (and mute).

---

## 4. Radio mode and hosts

Radio mode adds a host (or two) who talk between tracks. Most of it is in Settings › **The show** and Settings › **Hosts, voices, languages**.

### Hosts and voices

- For each host: **First name**, **Voice gender**, **Style** and **Voice** (with **Test**). Optional: **Your first name** (only used to sign your dedications: the hosts speak to all listeners, never to one person) and **City for the weather** (weather from Open-Meteo, free).
- **Host duo**: two hosts who answer each other, tease and don't always agree, in full sentences that flow into one another; short reactions ("No!", "Wait…") open a line instead of standing alone, so the voices are not chopped into one-word exchanges. Needs the Gemini voices. **Test the duo** plays both.
- **Host styles**: Warm, Quirky, Late-night voice, Pro FM, General-interest radio, Sports commentator, TV presenter, Rock'n'roll, Learned music buff, Hyped morning show, Nostalgic storyteller, Deadpan, Zen. The style changes how the AI writes and, with Gemini, the voice's tone and default voice. With the computer voice, only the text changes.
- **What makes the hosts talk?**:
  - **Computer**: voices installed on your computer — free and instant, but more robotic, no duo. To add voices: Windows, Settings › Time & language › Speech; Mac, System Settings › Accessibility › Spoken Content › System voice.
  - **Gemini**: 30 natural Google voices, male or female, solo or duo. If Gemini doesn't answer or your credits run out, the computer voice takes over: the radio never goes silent. When you save your first Gemini key, the hosts switch to the Gemini voices by themselves (a button in the message keeps the computer voice).

### Personality and memories

With a Claude or Gemini key, each host has a **Personality**: tastes, a quirk, a bit of their life and, in a duo, a role (the organised one and the improviser, the veteran and the newcomer…). It is drawn at random the first time; you can rewrite it freely, or click **New personality**.

- The AI uses it in small touches, never all at once.
- When a host reveals something new about themselves on air ("I saw them live in 1998, in the rain"), Mood DJ remembers it, and the hosts refer back to it in later shows, like an old running joke. Up to 100 memories are kept per host; the AI gets the 10 most recent plus a few older ones in rotation, and two near-identical memories are merged. **Show memories** lists them, most recent first, with a × button to forget a single one; **Forget memories** clears them all.
- In a duo, a topic left hanging at one interlude can come back at the next one.
- In **Economy** mode (see API keys › AI power), memories are neither recalled nor saved.

### The Jeff & Laeti duo, relationship and voice direction

- **Load the Jeff & Laeti duo** (top of the Hosts card, with a Claude or Gemini key): a former camera operator and a former sound engineer, two friends from a film crew who now talk about music and everything else. One click fills in their names, styles, personalities, their relationship, the station's universe and their voice direction. **Undo** in the message restores your previous settings. Everything stays editable.
- **Duo relationship** (co-host card): the duo's "bible", sent to the AI with every dialogue: how they talk, who teases whom, who leads when, their running gags, what they must never do. Optional, for any duo.
- **Voice direction (Gemini)**, for each host: a short note added to the voice style (e.g. "measured pace, a beat before the punchline").
- **The hosts' towns**: when you give your city (for the weather), Mood DJ asks the AI once for two real towns within about 50 km, one for each host. They mention it in passing ("back home in…"). The towns stay the same as long as you stay in the same country.
- The AI also knows whether you are in **Discovery** or **My likes** mode, so the right host can lead.

### Swapping, saving and loading hosts and universes

- **Swap the hosts** (top of the Hosts card, in a duo): the co-host becomes the main host and vice versa, with their names, genders, styles, profiles, stories, voices and memories. **Undo** in the message puts things back.
- **Their story** (each host): their personal lore — past, path, secrets. The AI alludes to it rarely and never gives a secret away.
- **My hosts** (each host): **Save this host** keeps their name, gender, style, personality, story, voice direction, Gemini voice and memories. Later, pick them in the list and click **Load** to put them in this seat — main host or co-host. Jeff and Laeti are always in the list as presets.
- **My universes** (station's universe card): **Save this universe** keeps the universe, the duo relationship, the amount and the events kept, under a name you choose. **Load** brings it back; **Delete** removes one of yours (presets stay).
- All of this is included in the backup.

### The hosts' picks

Settings › Hosts, voices, languages › **The hosts' picks**: **Never**, **Rare** (default, about one track in six) or **Often** (about one in four).

- Now and then, a host picks a track themselves: a personal favourite matching their personality, or a track brought in by the station's universe (the ongoing plot, a character, a legend).
- The track always fits your mood (style, energy), is checked on YouTube Music, respects your blocklist and is never one already played. It is slotted in after the locked tracks and shows up in **Up next** marked "pick by …" — you can remove it.
- The hosts make the most of it: a teaser beforehand ("I've saved you something for later…"), the host who chose it introduces it with their story, and after it the other one gives a verdict.
- One extra AI call per pick. Not used in **Economy** mode, nor without an AI key.

### The station's universe

With a Claude or Gemini key, Settings › Hosts, voices, languages › **The station’s universe** gives the hosts a small world of their own: where the station broadcasts from (a top-floor studio with a lift that never works, a houseboat…), an object of the studio, characters you never hear (the grumbling sound engineer, the station manager who texts during the show, the studio cat), a station legend, the hosts' shared story and an ongoing plot.

- It is drawn at random the first time; rewrite it as you like, or click **New universe**.
- **Amount**: **Never**, **Subtle** (default, about one segment in seven), **Regular** (about one in three) or **Very present** (often, even over intros). Never twice in a row, and the music stays the main topic.
- What the hosts make up on air (a studio mishap, the plot moving on) is kept and stays consistent from show to show. **Forget events** clears it.
- Not used in **Economy** mode.

### Announcements

- **AI writes the announcements**: with a Claude or Gemini key, every announcement is written fresh (comeback on the last track, time, energy going up or down, trivia). Without a key, ready-made phrases are used.
- Frequency: **Every track** or **One track in three**.
- **Announcement timing**: **Over the fade** (default: the host starts talking over the end of the track, the music dips, and the next track rises when they finish) or **Over the next track's intro**.
- The time comes back at most every quarter hour, the weather about every 35 minutes, the station name about every 12 minutes.
- Track names are said without technical tags ("Remastered", "Live", "Official Video"…).

### The intro

When you start a selection, the intro is fully prepared first ("The hosts are preparing the show…"). If a track is already playing, it carries on softly until the intro is ready. Then jingle, bed and voice follow without a gap; with the Gemini voices, the first track rises under the last seconds of the voice. **Play** or next during the preparation skips the intro.

### Interludes

**Interludes**: Never, Sometimes or Often. A real break with jingle and background bed, a few sentences (time, weather, the previous track, a story), then the next track rises under the last seconds of the voice. Next during an interlude cuts the host and starts the announced track.

### Upcoming tracks lineup (the 3-track programme)

On by default. With **Every track**, a cycle:

1. **The lineup**, over the fade: the hosts present the track that starts and the next ones.
2. **The feature**, as an interlude: a longer story (the song, the band, a film, the style's culture). With Interludes on Never, it's said over the fade, without a break.
3. **A short culture moment**, over the fade.

With **One track in three**, the announcement presents the coming tracks and the others play without voice. If you skip a track from the lineup, the hosts skip it too. Announced tracks are locked, plus the one that opens the next lineup.

### Segment rhythm

Settings › The show › **Segment rhythm**:

- **Natural** (default): segments don't fall exactly every N tracks; the next one is drawn at random around your setting, with the same average (for example, every 2 to 4 tracks for one track in three; the lineup presents 2 to 4 tracks).
- **Regular**: segments always land at the same position.
- Never two segments back to back, never more than 4 tracks without one. Now playing always shows when the next segment comes and which tracks are locked.

### Trivia

- **Trivia**: Rarely, Often (about one segment in three) or Very often (about one in two).
- Segments, each with its little jingle: "The story behind the hit", "The culture minute", "Back to 1978", "It happened on 25 November" (at most twice per show), "The evening serial" (the style's culture told in episodes) and "True or false".
- Topics: why and for whom a song was written, samples and famous covers, studio stories, legendary instruments, origin of a name or cover, flops that became hits, a song's appearance in a film, series or video game, real links between two artists played back to back.
- The hosts remember anecdotes already told (per artist, track and style) for 3 months.
- They stick to the facts in their sources and never talk about private life, health, deaths or legal affairs. When nothing is found, they tell a music-culture story instead.
- Small nods: your weather city when a source mentions it; the station's own rotation ("fourth time on air this month"), at most once every 30 minutes. The hosts never mention your likes, your tastes or how a track was picked.

### Chit-chat and conversation

Settings › The show › **Chit-chat and conversation** decides what share of the segments is a conversation between the hosts, instead of the lineup, the feature or the culture moment: Never, Sometimes (one in two, default), Often (almost all) or All the time. The **Test** button plays a moment of chit-chat right away, whatever the level.

- A conversation is always played by both hosts when the show has a duo, even over the fade, in three to five lines. When a lineup opens, it serves as the hook, then one of them reminds you of all the tracks coming up, each with its artist, and launches the first. The way back to the music is drawn from twelve possibilities, so it is not always the same word.
- **Music or chit-chat** (the slider just below): among those conversations, the share that is about something other than music, from 0 to 100 %, in the middle by default.
- **About the music**, 15 kinds of conversation: teasing, a disagreement, a guessing game, a link between two tracks, a joke, a hot take on the track just played, a word to the listeners, a callback, plus the track's "instructions for use", a dare, a musical confession, what happened in the studio during the last track, a teaser, a verdict (marks out of ten) and a personal question. 242 topics, about how a track feels and how you listen to it rather than its technique: the AI cannot hear the track. Stories come in as often as the **Trivia** setting says, and the true-or-false game is one more kind (see below).
- **Off-topic chit-chat**, 6 formats and 260 topics: small talk (daily life, the studio, themselves, absurd debates, films and games), "would you rather", a quick mini-game, a mock segment (the studio horoscope, the pointless tip of the day), news from the station (built on its universe) and a word to the listeners. Never the same format twice in a row, no topic back before a hundred others.
- Topics also vary by themselves: 26 of them have a blank filled at random each time, half of the "would you rather" dilemmas are assembled from two random halves, and one time in two a topic gets a twist ("told by the one who wasn't there", "it has become an affair of state in the studio"). A topic that comes back is never quite the same.
- Mood DJ also keeps count of what the hosts have already said: at most one catchphrase per segment and never two segments in a row, at most one personal detail, one running gag per show. Each host has a mood of the day, and each dialogue gets its own dynamic (in tune, teasing, bad faith, in a hurry, sincere…).
- Now and then one host cuts the other off; the voices do not overlap yet.
- On **All the time**, every segment is a conversation: no detailed lineup, feature or segment jingle. The intro, guests, dedications, host picks and vibe changes always keep their shape. With a single host, conversations become asides to the listeners.

### Host emotions

Settings › The show › **Host emotions** (with the Gemini voices), with a **Test** button:

- **Subdued**, **Intimate** (close to the mic, soft and tender, short sentences, silences, no sound effects), **Expressive** (real laughs, surprise, emotion), **Wild** (big bursts of laughter, shared giggles, shouted exclamations).
- **Auto** (default for a new install) picks the level for each segment: Intimate for bedtime, meditation, a soft track at night, a romantic mood; Subdued for work, morning, and melancholic, nostalgic, dark, dreamy or comforting moods; Wild for parties, workouts, very high energy. One notch up for a won true-or-false, a guest's arrival or a change of mood. Zen and Late-night voice never get carried away; Hyped morning show, Sports commentator, Rock'n'roll and TV presenter never go Subdued.
- The level used is shown under the setting ("Last segment"). The synthetic voice interprets it, so the result can vary.

### Studio sound effects and singing

- **Studio sound effects**: applause, cheers, ba-dum-tss after a joke, a drumroll before a true-or-false answer, a buzzer for a lost bet, a small fanfare for a won one. Generated by the extension, no files. **Listen to the sound effects** to hear them.
- **Singing (experimental)** (off by default): a host may hum, sing the station name to a jingle tune, or sing off-key for fun. Never the lyrics of a real song. **Test singing** forces it once; it needs an AI key for the texts, the Gemini voices and Expressive or Wild emotions.

### Guest specialist

From time to time, a specialist of the style playing drops by (rock specialist, jazz critic, DJ, musicologist, film critic for soundtracks…).

- The host announces them, welcomes them with a jingle; the guest takes the place of one of the two hosts for two or three segments, talks as an expert, then leaves by introducing a track.
- With two hosts, each welcomes guests in turn: a returning guest meets the host who did not welcome them last time, and a newcomer meets the host who did not welcome the previous guest. The welcoming host keeps their own voice, personality, memories and track picks. No true-or-false bet is played while a guest is talking: the bet and the score belong to the two hosts.
- Each speciality keeps its guest from one show to the next (same name, voice, style and quirk), and the host remembers them.
- **Guest specialist**: Never, Rarely (about once an hour, default) or Often (about every 30 minutes). **Past guests** lets you forget one: someone new will come for that speciality.
- Needs an AI key for the texts and the Gemini voices. Guests use the same sources as the hosts and never claim to have met an artist.
- **Camille and Arthur on air** (only with the Jeff & Laeti duo, on by default): two characters from the duo's world share the guest slot. Camille, the barmaid of the Ty Loup, the bar in Locronan (lively voice), takes about one guest slot in two and stays for one or two segments. Arthur, a regular of the Ty Loup (calm voice), takes about one in ten, never twice within twenty hours, and hardly stays. His first visit is with Jeff, then he alternates like any guest. Each comes once per show at most; the other slots stay with the specialists. They are not music experts: they chat in their own way, no fact sheet is looked up for them, and the AI is told not to invent anything about their lives beyond their character sheet. **Test** plays Camille coming on air. In **Past guests**, forgetting one of them only resets their visit count.

### True or false

Settings › The show › **Games between the hosts**: Never, Sometimes (default) or Often. The game is one kind of conversation among the others, drawn at the same rank as a confession or a dare (a few per cent of the segments; about two and a half times more on Often). It needs a reliable fact sheet about the track; without one, another conversation takes its place. No game when chit-chat is on Never.

- **Two-step bet** (on Every track, when a lineup opens): a true-or-false about the second announced track. The co-host bets (you can too, in your head) and the answer comes just before that track.
- Sometimes it's an open question ("do you know why this song almost never came out?") answered at the same moment.
- **Express** version, now and then: question, bet and answer in one announcement.
- Mood DJ draws at random whether the statement is true and whether the co-host is right. The score is kept for the show, and the loser sometimes gets a small forfeit.
- A false statement is only about a harmless detail (a year, a place, an instrument, a number), never a death, illness, accident, legal affair or private life, and never a fake quote. The true version is always given. If you skip the track, the answer comes at the next segment.

### End-of-show recap

Settings › The show › **End-of-show recap** (on by default): when a selection reaches its length, the hosts wrap up over a background bed — a memory or two, the guests, the game score and the next show on the schedule.

### Test buttons

Settings › The show has **Test** buttons next to Interludes, Trivia, Guest specialist, Camille and Arthur on air (Jeff & Laeti duo) and Host emotions. The trivia and guest tests use the current track, or a classic if nothing is playing.

---

## 5. Dedications and requests

In Now playing, during a selection, the **Dedication or request** card: **For**, **Message (optional)**, **Requested track (optional)** and **From**, then **Send on air**.

- Without a requested track: the hosts read the dedication just before the next track (or the one after, if its announcement is already on its way), even if no announcement was planned.
- With a requested track: Mood DJ searches YouTube Music for it and plays it right after the current track, presented as a request.
- For a birthday or a celebration, the hosts send their wishes (with applause if sound effects are on).
- The message is read as is, never as an instruction; a hurtful word is not read.
- In Up next, the tracks concerned show "· dedication" or "· request". Without an AI key, the dedication is read in one simple sentence.

---

## 6. Languages

Settings › Hosts, voices, languages › **Languages**:

- **Interface language**: Automatic (Chrome language), Français or English. On Automatic, the interface is in English as soon as Chrome isn't set to French. The panel, messages, remote and keys page all switch.
- **Radio language**: French, English, German, Spanish, Italian, Portuguese, Dutch, Polish, Swedish, Danish, Norwegian, Finnish, Czech, Turkish, Japanese, Korean, Arabic, Hindi. The AI (Claude or Gemini) writes directly in that language and the multilingual Gemini voices speak it. You can have an English interface and a German radio.
- **Without an AI key**, the hosts use ready-made phrases: in French for a French radio, in English for every other language.
- With the computer voice, a voice for that language must be installed on your computer.
- Rare case: a one-word song title identical to an interface label ("Pause"…) may be translated on screen.

---

## 7. Shows schedule, wake-up and history

### Show schedule

Settings › **Show schedule** › **New show**: name, days, start time, length (or continuous) and vibe (one of My vibes or your current settings). At the set time, Mood DJ starts the show by itself and the hosts announce it by name ("Thursday night rock"). Each show can be paused, edited, deleted or started now (**Start now**).

### Gentle wake-up

An option for a scheduled show: if no YouTube Music tab is open, Mood DJ opens one; the volume starts low and rises over three minutes; the hosts take a morning tone and give the time. Without a chosen vibe, the Wake-up moment is used.

For the schedule to work, Chrome must be open and the computer on (not asleep). Depending on Chrome's settings, a tab opened on its own may wait for a click before playing sound.

### History

The **History** tab logs each show as it goes (nothing is lost if the tab closes): date, length, vibe, tracks (including the ones you skipped), guests, game score and dedications. For each show: view the tracks (and listen to one again), **Reuse this vibe**, **Save as playlist**, **Delete**. The last 60 shows are kept.

---

## 8. Likes, dislikes and blocklist

- **Like** (heart) in the mini-player likes the track in YouTube Music.
- **Dislike** (thumb down): the track is marked in YouTube Music, skipped right away, and never comes back in Mood DJ selections. A second click cancels. Settings › Playback and library › **Forget my Dislikes** clears them all.
- **My Likes**: **Refresh my Likes**, and **Sort all** to have the AI sort them by style and energy (done once, kept in the browser). Unsorted Likes are also sorted in the background.
- **My discoveries**: every track discovered and sorted joins your personal catalog (up to 20,000 tracks), also used by catalog selections. You can turn them off or clear them in Settings › Playback and library.
- **Blocklist**: a blocked artist never plays again, whatever the source, even as a featured artist. Add one from Now playing (**Never play …**), from History (the no-entry sign next to a track) or in Settings › Playback and library › **Blocklist**. An artist added while playing is skipped immediately. The same card lists your Dislikes, which you can remove one by one.
- Skipping a track tells Mood DJ something too: an artist you often skip comes back less.

### Playback settings

Settings › Playback and library:

- **Mood DJ takes priority** (on by default): during a selection, YouTube Music no longer switches tracks by itself. Its Next / Previous buttons, Shift+N, Shift+P and media keys control Mood DJ. If you click a track in YouTube Music yourself, it plays in the mix, then the selection resumes. YouTube Music's "Still there?" window is confirmed automatically. Turned off, Mood DJ pauses when you start another track, and **Resume** restarts the selection.
- **No autoplay on load**: when the YouTube Music page reloads, Mood DJ keeps it paused for 45 seconds until you start something.
- Previous goes back to the previous track of the selection, or to the start of the track after 4 seconds.

---

## 9. Trivia and sources

To keep the hosts from inventing things, Mood DJ gives them short fact sheets. Without any key:

- **Wikipedia**: the song's article, the artist's article, the style's article, and the day's page for "It happened on…". When an article isn't found in French or English, Mood DJ finds it in another language through Wikidata, and the hosts translate it.
- **YouTube Music**: the artist's page.
- **MusicBrainz**: band formation, members and instruments, first release of the song, writers, producer, studio, samples, number of covers.
- **Wikidata**: awards, genres, labels, influences, country, release date, gold records.
- **Deezer**: the track's popularity and release date.

How the right sheet is found:

- A band name is searched whole ("Earth, Wind & Fire", "Simon & Garfunkel", "Bob Marley & The Wailers"); only a real collaboration ("Lady Gaga & Bradley Cooper") falls back to its main artist.
- For the song, the article about the song is preferred to the album of the same name; if only the album's article exists, it is given to the hosts as the album's story, not the song's. An article is kept only if it names the artist, as whole words.
- For the first release, MusicBrainz's original recording is used, not a concert or a later version.
- The song's sheet comes before the artist's article, so it is never the part that gets cut.
- With no sheet at all for a track, the hosts don't tell a story: another conversation takes its place. They are also told that they cannot hear the music, so they never describe a sound, an instrument or a passage the sheets don't mention.
- A story counts as "already told" (and is avoided for 90 days) only once it has actually been said on air.

With a free key (Settings › API keys › **Trivia sources** and **Concerts**; each has a **Test** button):

- **Last.fm**: listener counts, listener tags, album, artist bio. With Mix from this track, Last.fm's close artists are added to YouTube Music's.
- **Discogs**: original release (label, country, format), precise styles, detailed credits (producer, musicians, engineers).
- **Setlist.fm**: the artist's last concert and the song's place on stage (played at almost every show, often as opener or encore… or never).
- **Upcoming concerts** (Settings › API keys › Concerts, off by default): when the artist has dates announced in the next 9 months, the hosts slip in a short concert flash (date, city, venue or festival), at most once every 3 days per artist — "near you" if it's in your weather city. The dates come from a Google search run by Gemini with your Gemini key: no other key to create (Ticketmaster has been removed). Google may bill these searches at its own rates; Mood DJ runs at most twelve a day and keeps each answer for five days. The hosts present the dates as announced, and give the month rather than the day for a long run in the same venue. The Now playing tab shows where the dates of the last flash came from, with Google's search suggestions. **Announced concerts** chooses the country (France by default, Belgium, Switzerland, Canada, Luxembourg or worldwide). Never prices or ticket links on air.

Fact sheets are kept for 60 days.

---

## 10. API keys (strongly recommended)

> **API keys are what bring the radio to life**: hosts who write real announcements about every track, natural voices in solo or duo, trivia, guests, games and concert dates. **A free Gemini key from [aistudio.google.com](https://aistudio.google.com) already unlocks a lot**: with only a Gemini key, both the voices and the texts work.

Without any key, Mood DJ still works in a limited form: built-in catalog, ready-made phrases and your computer's voice.

### Where to enter them

Settings › **API keys** › **Enter key…**, or the remote › **API keys**. Keys are typed in a secure page of the extension, not in the YouTube Music page. Once saved, a key is never shown again: to change it, paste a new one. All keys are optional.

### Which key does what

- **Claude** (Anthropic) or **Gemini** (Google) writes the texts: announcements, interludes, guests, recaps, selections described in words, added styles and the sorting of your tracks. Choose in **Who writes the texts?**. If the chosen engine has no key or fails (outage, limit reached, no credit), the other takes over if its key is saved.
- **Gemini** also provides the hosts' voices.
- **Last.fm, Discogs, Setlist.fm**: extra trivia (see section 9). Upcoming concert dates use the Gemini key.

### Gemini (free and paid)

- Free key: on [aistudio.google.com](https://aistudio.google.com), **Get API key** button, in a project **without billing**. A Google AI Pro subscription does not include a key, but the free key is enough.
- On the free tier, quotas are limited and Google may use the text sent to improve its products.
- Optional **paid key, as backup**: used when the free key hits its limit (per minute or per day). The two keys take turns: the free one refills every day, the paid one covers the gap. As long as one of them answers, nothing is shown; when neither does, the message says which key is in which state and when the free one comes back.
- **Gemini model** for texts: Gemini 3.8 Flash (fast, recommended) or Gemini 4 Argon (newer, more expensive). If Google renames a model, Mood DJ picks the latest Flash by itself. For voices: Gemini 3.8 Flash TTS (best quality) or Flash-Lite TTS (more economical).
- If Google refuses a key, the message says which one (free or paid) and why. If the free key is refused and a paid one is saved, the paid one takes over.
- Error 402: the key's Google project uses prepaid billing with no credit. Free fix: create a key in a **new** project without billing. Paid fix: add credits at aistudio.google.com/billing ($5 minimum).

### Claude

1. On claude.ai: Settings › Billing, "API credits" section, then "Link organization" to activate the API credits included in a Max subscription.
2. On platform.claude.com, create an API key just for Mood DJ. You can set a spending limit there.
3. Paste it in Mood DJ, then **Test**.

### Other keys

- **Last.fm**: sign in at last.fm, go to last.fm/api/account/create, paste the "API key" (not the secret).
- **Discogs**: on discogs.com, Settings › Developers › "Generate new token".
- **Setlist.fm**: create an account, then setlist.fm/settings/api.

### AI power

Settings › API keys › **AI power**, for the hosts' scripts:

- **Economy**: short scripts written by the lightest model (Claude Haiku 5.5 or Gemini 3.8 Flash), a duo of three lines at most, no host memory. The cheapest.
- **Normal** (default): the model you chose writes the scripts, with personalities and memories.
- **Full power**: the most powerful model (Claude Opus 5.5 or Gemini 4 Argon) writes longer, more polished dialogues (except over track intros). Livelier, but more expensive (with Claude, about twice the price of Sonnet) and a little slower; announcements are prepared in advance, so you don't hear the difference.

Claude Opus 5.5 can also be picked directly as the **Claude model**.

### Today's usage

Under the call cap, **Today’s usage (estimate)** shows the estimated cost of Claude since midnight (from Claude's public prices and the usage each answer reports, cache included) and the number of Gemini calls with the free and the paid key. Gemini paid calls are billed by Google at its own prices.

### Spending cap

**Hourly call cap**, counted separately for the scripts and for the Gemini voices. On **Automatic**, it follows the AI power: 40 scripts and 60 voices per hour in Economy, 150 and 150 in Normal, 300 and 300 in Full power. You can also set 20, 40, 80, 150 or 300 per hour. Beyond that, calls are refused with a message saying how many minutes to wait, and the hosts switch to ready-made phrases. This cap does not replace a spending limit set in the service's console.

---

## 11. Backup

Settings › Log and backup › **Backup**:

- **Export**: a file with your settings, your sorted Likes, your discoveries and the hosts' memory (anecdotes already told, artist pages, fact sheets). API keys and the debug log are never in the file.
- **Import**: puts that file back into Mood DJ, here or in the Mood DJ app (that's how you move from the extension to the app). Stop the current selection before importing.

---

## 12. Privacy

- Keys stay in your browser and are only sent to their own service.
- Keys are entered in an extension page, so YouTube Music's scripts can't read what you type; the Mood DJ panel is closed to the page's scripts too.
- Settings › **About** has the legal notice, privacy policy (what goes to which service), AI transparency, and sources and credits.

Full details: [legal.en.html](legal.en.html).

---

## 13. Troubleshooting, good to know, limits

### If something goes wrong

- Reload the YouTube Music page after installing or updating the extension.
- In `chrome://extensions`, Mood DJ's **Errors** button shows what went wrong.
- To report a bug: Settings › Log and backup › **Report a problem**, **Download** the debug log, then **Send an email** to biduletrash@yahoo.com describing what happened. The log keeps the last 4,000 events in this browser and contains no API key.

### Good to know

- With a free YouTube Music account, ads play normally: Mood DJ waits for them to end.
- For "made for kids" content, YouTube forbids the mini player, so Mood DJ keeps the big player page open during those tracks.
- An artist never comes back within the next 3 tracks, and rarely before 6.

### Limits

- Track energy is an estimate, not a measurement of the sound.
- **Current** depends on the new-release playlists YouTube Music offers for each style; for rare styles, Mood DJ widens to the 2020s.
- Mood DJ relies on how YouTube Music works internally. If YouTube changes its site, some features may stop working until the extension is updated.
- Synthetic voices interpret tones and emotions; the result can vary from one time to the next.

---

© 2026 Breizhad. All rights reserved. Private use only.

Independent project, not affiliated with YouTube, Google or Anthropic.
