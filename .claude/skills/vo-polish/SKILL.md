---
name: vo-polish
description: Use whenever voiceover or narration audio is added to the video. Cleans and masters VO to crisp, professional, broadcast-style sound with ffmpeg before it goes into Remotion.
---
# VO polish

Input: raw recordings in video/vo/raw/ (m4a, mp3, wav, mov). Output: video/vo/clean/<name>.wav (48 kHz, 24-bit, mono).

For each file:
1. Convert to 48 kHz mono WAV.
2. Trim leading and trailing silence, and shorten long pauses inside the take to at most 0.4 s.
3. Run this chain, then listen-check by measuring loudness:
   ffmpeg -i in.wav -af "highpass=f=80,lowpass=f=14000,afftdn=nf=-25,adeclick,deesser=i=0.4,equalizer=f=200:t=q:w=1:g=-2,equalizer=f=3500:t=q:w=1.5:g=2.5,acompressor=threshold=-20dB:ratio=3:attack=5:release=80:makeup=3,alimiter=limit=0.95,loudnorm=I=-16:TP=-1.5:LRA=7" -ar 48000 -c:a pcm_s24le out.wav
4. Run loudnorm a second time in two-pass mode (measure, then apply) so every clip lands at -16 LUFS integrated and -1.5 dBTP, which keeps all speakers at the same volume.
5. If noise is still audible, raise afftdn strength one step at a time (nf -30, then -35). Stop if the voice starts to sound watery.
6. Never pitch-shift, speed up, or AI-regenerate the voice. Keep it the speaker's real voice.
7. In Remotion, duck background music to about -24 LUFS under the VO and fade it 0.5 s around each line.
8. Report the before and after loudness for each file.
