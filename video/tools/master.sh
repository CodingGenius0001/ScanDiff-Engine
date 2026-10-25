#!/bin/zsh
# Master the rendered video's audio: two-pass loudnorm of the full mix to
# -16 LUFS integrated, -1.5 dBTP, 48 kHz AAC. The video stream is copied untouched.
# Usage: tools/master.sh in.mp4 out.mp4
set -e
in=$1; out=$2
pass1=$(ffmpeg -hide_banner -nostats -i "$in" -vn -af "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$pass1" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
echo "before: $(get input_i) LUFS, $(get input_tp) dBTP, LRA $(get input_lra)"
ffmpeg -hide_banner -v error -y -i "$in" -map 0:v -map 0:a -c:v copy \
  -af "loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true,aresample=48000" \
  -c:a aac -b:a 256k -ar 48000 -movflags +faststart "$out"
ffmpeg -hide_banner -nostats -i "$out" -af ebur128=peak=true -f null - 2>&1 | grep -A12 Summary | grep -E "I:|Peak:" | sed 's/^/after: /'
