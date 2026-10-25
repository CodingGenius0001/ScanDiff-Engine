#!/bin/zsh
# Run a command, and kill it (and its children) if the Mac's used memory
# (active + wired + compressed) goes over the cap. The laptop hangs and resets
# under heavy load, so every heavy job in this build runs through this.
#
# Usage: video/tools/memguard.sh [-g GB] command args...
#   -g GB   cap in GB (default 39, under the 40 GB limit)

cap=39
if [[ "$1" == "-g" ]]; then cap=$2; shift 2; fi

used_gb() {
  vm_stat | awk -v ps="$(pagesize)" '
    /Pages active/ {a=$3} /Pages wired/ {w=$4} /occupied by compressor/ {c=$5}
    END {printf "%.1f", (a+w+c)*ps/1e9}'
}

# Kill the whole tree, children first (ffmpeg, chrome, node workers).
kill_tree() {
  local c
  for c in $(pgrep -P $1); do kill_tree $c $2; done
  kill -$2 $1 2>/dev/null
}

# Every descendant ever seen, so children re-parented after their parent died
# (pipelines, crashed shells) are still found and stopped.
typeset -U seen
collect() {
  local c
  for c in $(pgrep -P $1); do seen+=($c); collect $c; done
}
kill_seen() {
  local p
  for p in $seen; do kill -$1 $p 2>/dev/null; done
}

# Heavy tools already running before this job are left alone; any new ones are this job's.
HEAVY='whisper-cli|ffmpeg|ffprobe|chrome-headless-shell|Chrome for Testing|remotion'
before=(${(f)"$(pgrep -f "$HEAVY")"})
kill_new_heavy() {
  local p
  for p in ${(f)"$(pgrep -f "$HEAVY")"}; do
    (( ${before[(Ie)$p]} )) || [[ $p == $$ ]] || kill -$1 $p 2>/dev/null
  done
}

"$@" &
pid=$!
peak=0
while kill -0 $pid 2>/dev/null; do
  collect $pid
  u=$(used_gb)
  (( u > peak )) && peak=$u
  if (( u > cap )); then
    echo "memguard: system memory ${u} GB > ${cap} GB cap, stopping: $*" >&2
    kill_tree $pid TERM; kill_seen TERM; kill_new_heavy TERM; sleep 2; kill_tree $pid KILL; kill_seen KILL; kill_new_heavy KILL
    wait $pid 2>/dev/null
    exit 137
  fi
  sleep 1
done
wait $pid
rc=$?
left=()
for p in $seen; do kill -0 $p 2>/dev/null && left+=($p); done
if (( ${#left} )); then
  echo "memguard: ${#left} child process(es) outlived the job, stopping them: ${left}" >&2
  for p in $left; do kill -KILL $p 2>/dev/null; done
fi
kill_new_heavy KILL
echo "memguard: peak system memory ${peak} GB (cap ${cap} GB)" >&2
exit $rc
