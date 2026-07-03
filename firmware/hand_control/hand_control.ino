/*
 * hand_control — InMoov right hand, 5 fingers + wrist on an Arduino Uno.
 *
 * Serial protocol @ 9600 baud. Two ways to command the hand:
 *
 *   1) Absolute pose (used by the desktop app):
 *        Send a line of six integers  "T I M R P W\n"
 *        e.g. "60 40 30 150 40 90"  -> writes those angles directly.
 *      Each value is clamped to that finger's safe range (see *_MIN / *_MAX).
 *
 *   2) Single-char jog (for manual calibration in a serial monitor):
 *        thumb  q/a   index w/s   middle e/d
 *        ring   f/r   pinky t/g   wrist  u/y
 *      Each key nudges that finger by JOG_STEP degrees.
 *
 *   3) Query:  "?"  -> print the current angle line once.
 *
 * Output: the hand prints its six current angles as a line
 *   "T I M R P W\n"
 * whenever they change (and in response to "?"), plus a heartbeat every
 * HEARTBEAT_MS so a host can confirm the link is alive. It does NOT flood
 * the port every loop.
 *
 * Pin map: thumb=2 index=3 middle=4 ring=5 pinky=6 wrist=7.
 * Note: the ring servo is mechanically inverted vs. the others
 * (RING_MAX = open/extended, RING_MIN = closed). The host is responsible
 * for the ASL semantics; this sketch only writes raw, clamped angles.
 */

#include <Servo.h>

// ── Servos ────────────────────────────────────────────────────────────────
Servo servothumb;   // pin 2
Servo servoindex;   // pin 3
Servo servomiddle;  // pin 4
Servo servoring;    // pin 5
Servo servopinky;   // pin 6
Servo servowrist;   // pin 7

// ── Per-finger safe limits (raw servo degrees) ──────────────────────────────
const int THUMB_MIN  = 60,  THUMB_MAX  = 180;
const int INDEX_MIN  = 40,  INDEX_MAX  = 180;
const int MIDDLE_MIN = 30,  MIDDLE_MAX = 180;
const int RING_MIN   = 0,   RING_MAX   = 150;   // inverted: MAX = open
const int PINKY_MIN  = 40,  PINKY_MAX  = 180;
const int WRIST_MIN  = 0,   WRIST_MAX  = 180;

const int JOG_STEP     = 10;    // degrees per jog keypress
const unsigned long HEARTBEAT_MS = 1000;

// ── Current commanded angles (start in the "open" pose) ─────────────────────
int angThumb  = THUMB_MIN;
int angIndex  = INDEX_MIN;
int angMiddle = MIDDLE_MIN;
int angRing   = RING_MAX;    // open (inverted)
int angPinky  = PINKY_MIN;
int angWrist  = 90;          // centered

// ── Serial line buffer ──────────────────────────────────────────────────────
const int LINE_MAX = 48;
char lineBuf[LINE_MAX];
int  lineLen = 0;

unsigned long lastHeartbeat = 0;

int clampi(int v, int lo, int hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

void writeServos() {
  servothumb.write(angThumb);
  servoindex.write(angIndex);
  servomiddle.write(angMiddle);
  servoring.write(angRing);
  servopinky.write(angPinky);
  servowrist.write(angWrist);
}

void printAngles() {
  Serial.print(angThumb);  Serial.print(' ');
  Serial.print(angIndex);  Serial.print(' ');
  Serial.print(angMiddle); Serial.print(' ');
  Serial.print(angRing);   Serial.print(' ');
  Serial.print(angPinky);  Serial.print(' ');
  Serial.println(angWrist);
}

void setup() {
  servothumb.attach(2);
  servoindex.attach(3);
  servomiddle.attach(4);
  servoring.attach(5);
  servopinky.attach(6);
  servowrist.attach(7);

  Serial.begin(9600);
  writeServos();
  Serial.println("hand_control ready");
  printAngles();
}

// Apply six absolute angles from a parsed pose line. Returns true on success.
bool applyPose(const char *s) {
  int vals[6];
  int n = sscanf(s, "%d %d %d %d %d %d",
                 &vals[0], &vals[1], &vals[2], &vals[3], &vals[4], &vals[5]);
  if (n != 6) return false;
  angThumb  = clampi(vals[0], THUMB_MIN,  THUMB_MAX);
  angIndex  = clampi(vals[1], INDEX_MIN,  INDEX_MAX);
  angMiddle = clampi(vals[2], MIDDLE_MIN, MIDDLE_MAX);
  angRing   = clampi(vals[3], RING_MIN,   RING_MAX);
  angPinky  = clampi(vals[4], PINKY_MIN,  PINKY_MAX);
  angWrist  = clampi(vals[5], WRIST_MIN,  WRIST_MAX);
  return true;
}

// Apply a single jog keypress. Returns true if it changed anything.
bool applyJog(char c) {
  switch (c) {
    case 'q': case 'Q': angThumb  = clampi(angThumb  - JOG_STEP, THUMB_MIN,  THUMB_MAX);  return true;
    case 'a': case 'A': angThumb  = clampi(angThumb  + JOG_STEP, THUMB_MIN,  THUMB_MAX);  return true;
    case 'w': case 'W': angIndex  = clampi(angIndex  - JOG_STEP, INDEX_MIN,  INDEX_MAX);  return true;
    case 's': case 'S': angIndex  = clampi(angIndex  + JOG_STEP, INDEX_MIN,  INDEX_MAX);  return true;
    case 'e': case 'E': angMiddle = clampi(angMiddle - JOG_STEP, MIDDLE_MIN, MIDDLE_MAX); return true;
    case 'd': case 'D': angMiddle = clampi(angMiddle + JOG_STEP, MIDDLE_MIN, MIDDLE_MAX); return true;
    case 'f': case 'F': angRing   = clampi(angRing   - JOG_STEP, RING_MIN,   RING_MAX);   return true;
    case 'r': case 'R': angRing   = clampi(angRing   + JOG_STEP, RING_MIN,   RING_MAX);   return true;
    case 't': case 'T': angPinky  = clampi(angPinky  - JOG_STEP, PINKY_MIN,  PINKY_MAX);  return true;
    case 'g': case 'G': angPinky  = clampi(angPinky  + JOG_STEP, PINKY_MIN,  PINKY_MAX);  return true;
    case 'u': case 'U': angWrist  = clampi(angWrist  - JOG_STEP, WRIST_MIN,  WRIST_MAX);  return true;
    case 'y': case 'Y': angWrist  = clampi(angWrist  + JOG_STEP, WRIST_MIN,  WRIST_MAX);  return true;
    default: return false;
  }
}

// Process one complete line from the host.
void handleLine(char *s) {
  // Trim leading whitespace.
  while (*s == ' ' || *s == '\t' || *s == '\r') s++;
  if (*s == '\0') return;

  if (*s == '?') {
    printAngles();
    return;
  }

  // A digit or minus sign starts an absolute pose (six ints).
  if (*s == '-' || (*s >= '0' && *s <= '9')) {
    if (applyPose(s)) {
      writeServos();
      printAngles();
    }
    return;
  }

  // Otherwise treat the first character as a jog key.
  if (applyJog(*s)) {
    writeServos();
    printAngles();
  }
}

void loop() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\n') {
      lineBuf[lineLen] = '\0';
      handleLine(lineBuf);
      lineLen = 0;
    } else if (lineLen < LINE_MAX - 1) {
      lineBuf[lineLen++] = c;
    } else {
      lineLen = 0;  // overflow: drop the oversized line
    }
  }

  unsigned long now = millis();
  if (now - lastHeartbeat >= HEARTBEAT_MS) {
    lastHeartbeat = now;
    printAngles();
  }
}
