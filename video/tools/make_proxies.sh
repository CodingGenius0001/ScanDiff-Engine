#!/bin/zsh
# Graded, CFR 30 fps H.264 proxies of the source ranges the edit uses.
# Run through video/tools/memguard.sh; one encode at a time, 4 threads.
set -e
cd "$(dirname $0)/../.."
OUT=video/public/clips
LUT=video/public/luts/hlg_to_709.cube
mkdir -p $OUT
HLG="scale=%W%:%H%:in_color_matrix=bt2020:in_range=tv:out_color_matrix=bt709:out_range=tv:flags=lanczos,format=gbrp,lut3d=$LUT,format=yuv420p"
X264=(-c:v libx264 -preset medium -crf 16 -pix_fmt yuv420p -threads 4 -x264-params threads=4 -an -movflags +faststart)

cam() { # src start end name w h extra-filters
  local vf=${HLG//\%W\%/$5}; vf=${vf//\%H\%/$6}
  [[ -n $7 ]] && vf="$vf,$7"
  [[ -f $OUT/$4.mp4 ]] && { echo "skip $4"; return; }
  echo "encode $4"
  ffmpeg -v error -threads 4 -y -ss $2 -to $3 -i media/$1 -vf "fps=30,$vf" -color_primaries bt709 -color_trc bt709 -colorspace bt709 $X264 $OUT/$4.mp4
}
scr() { # start end name extra
  [[ -f $OUT/$3.mp4 ]] && { echo "skip $3"; return; }
  echo "encode $3"
  ffmpeg -v error -threads 4 -y -ss $1 -to $2 -i media/VDMJ2492.MP4 -vf "fps=30${4:+,$4}" $X264 $OUT/$3.mp4
}

# iPhone screen recording (SDR, 1320x2868 VFR 60 -> CFR 30)
scr 9 200 scr_capture
scr 416 591 scr_results
# Reconstruction wait 5:00-6:56 as a 3 s timelapse (every 39th frame at 30 fps)
[[ -f $OUT/scr_recon_tl.mp4 ]] || ffmpeg -v error -threads 4 -y -ss 300 -to 416 -i media/VDMJ2492.MP4 -vf "fps=30,select='not(mod(n\,39))',setpts=N/30/TB" $X264 $OUT/scr_recon_tl.mp4

# Camera b-roll (HLG ProRes 4K -> graded Rec.709). IMG_6526 comes out upside down: rotate 180.
cam IMG_6526.MOV 18 50 cam6526_orbit 1440 2560 "hflip,vflip"
cam IMG_6526.MOV 96 150 cam6526_close 1440 2560 "hflip,vflip"
cam IMG_6526.MOV 184 196 cam6526_recon 1440 2560 "hflip,vflip"
# IMG_6525 was shot with the phone on its side: turn it 90 degrees counterclockwise.
cam IMG_6525.MOV 0 7 cam6525_list 1920 1080 "transpose=2"
cam IMG_6525.MOV 12 40 cam6525_scan 1920 1080 "transpose=2"
ls -la $OUT
