#!/bin/zsh
# Voice samples for the References demo: macOS `say` + ffmpeg (pitch, room, a radio for Dispatch).
# Writes ../media/voice-<id>.mp3 and prints each one's duration and 56 waveform peaks as JSON.
set -e
cd "${0:A:h}"
OUT=../media
TMP=$(mktemp -d)
say -v Samantha -r 168 -o $TMP/maya.aiff "I don't read them. [[slnc 260]] That's the job."
say -v Daniel -r 148 -o $TMP/omar.aiff "Somebody who needs you [[slnc 140]] not to open it."
say -v Ralph -r 205 -o $TMP/dispatch.aiff "Maya. One more. Pick-up at the port, drop at the old cinema. [[slnc 220]] Triple rate."
pitch() { local sr=$(ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate -of csv=p=0 $1); echo "asetrate=$((sr))*$2,aresample=44100"; }
ffmpeg -y -loglevel error -i $TMP/maya.aiff -af "$(pitch $TMP/maya.aiff 0.93),atempo=1.04,highpass=f=80,aecho=0.8:0.55:32:0.12,loudnorm=I=-18:TP=-2" -ac 1 -c:a libmp3lame -b:a 112k $OUT/voice-maya.mp3
ffmpeg -y -loglevel error -i $TMP/omar.aiff -af "$(pitch $TMP/omar.aiff 0.86),atempo=1.08,highpass=f=70,aecho=0.8:0.5:40:0.14,loudnorm=I=-18:TP=-2" -ac 1 -c:a libmp3lame -b:a 112k $OUT/voice-omar.mp3
ffmpeg -y -loglevel error -i $TMP/dispatch.aiff \
  -f lavfi -i "anoisesrc=d=0.16:c=pink:a=0.35:r=44100" -f lavfi -i "anoisesrc=d=0.10:c=white:a=0.25:r=44100" \
  -filter_complex "[0:a]$(pitch $TMP/dispatch.aiff 0.95),highpass=f=380,lowpass=f=3000,acompressor=threshold=0.08:ratio=8:attack=5:release=60,volume=2.2,alimiter=limit=0.7[v];[1:a]highpass=f=600,lowpass=f=4200,afade=t=out:st=0.08:d=0.08[n1];[2:a]highpass=f=900,lowpass=f=5000,afade=t=out:st=0.04:d=0.06[n2];[n1][v][n2]concat=n=3:v=0:a=1,loudnorm=I=-18:TP=-2" \
  -ac 1 -c:a libmp3lame -b:a 112k $OUT/voice-dispatch.mp3
for id in maya omar dispatch; do
  ffmpeg -y -loglevel error -i $OUT/voice-$id.mp3 -ac 1 -ar 8000 -c:a pcm_s16le $TMP/$id.wav
  python3 -I - $TMP/$id.wav $id <<'PY'
import sys, wave, array, json
w = wave.open(sys.argv[1]); n = w.getnframes(); a = array.array('h', w.readframes(n))
bars = 56; step = max(1, len(a) // bars)
peaks = [max(abs(x) for x in a[i*step:(i+1)*step] or [0]) for i in range(bars)]
top = max(peaks) or 1
print(json.dumps({'id': sys.argv[2], 'dur': round(n / 8000, 2), 'peaks': [round(p / top, 2) for p in peaks]}))
PY
done
rm -rf $TMP
