/*
 * hand_control — InMoov right hand, 5 fingers + wrist on an Arduino Uno.
 * Servos are 3-wire hobby servos (HK15298) — open-loop, no position feedback.
 *
 * CONTROL MODEL
 *   With no feedback, absolute positioning is unreliable (the host's idea of
 *   position drifts from reality and the servo forces to a wrong angle). So the
 *   primary control is RELATIVE nudging: move a finger a few degrees at a time
 *   and watch it. Per-finger software limits (set live during calibration) stop
 *   a finger from being driven past its mechanical hardstop.
 *
 * POWER-ON: all servo signal pins are held LOW (defined 0 V, no pulses) and the
 *   servos are left detached — nothing is driven, so the hand holds its pose and
 *   powered servos don't twitch on a floating line.
 *
 * SERIAL PROTOCOL @ 9600 baud (newline-terminated)
 *   "n I D"    nudge finger I (0..5) by signed D degrees (clamped to limits).
 *   "j I A"    set finger I to absolute angle A (clamped).
 *   "L I A B"  set finger I limits to [min(A,B), max(A,B)] (live calibration;
 *              does not move the finger). Clamps the current target into range.
 *   "T I M R P W"  six ints -> absolute pose; only fingers whose value changed
 *              are driven (clamped). Used by the ASL page.
 *   single char jog: thumb q/a index w/s middle e/d ring f/r pinky t/g wrist u/y
 *   "?"        print the six commanded target angles ("T I M R P W").
 *   "l"        print the twelve limits ("LIM min0 max0 ... min5 max5").
 *   "x"        relax: detach all servos and hold pins LOW (stop driving).
 *
 * Fingers index: 0 thumb, 1 index, 2 middle, 3 ring, 4 pinky, 5 wrist.
 * The ring servo is mechanically inverted. Output telemetry: the six target
 * angles on change + a 1 Hz heartbeat.
 */

#include <Servo.h>

const int N = 6;   // thumb, index, middle, ring, pinky, wrist

Servo servos[N];
const uint8_t SERVO_PIN[N] = { 2, 3, 4, 5, 6, 7 };

// Pulse-width window. Standard servo travel is 544us(0deg)..2400us(180deg); we
// extend slightly at both ends so a finger can be driven a few degrees PAST the
// nominal 0/180 during calibration ("negative" travel). Kept conservative to
// avoid straining the servo against its internal stop.
const int US_MIN = 450;   // ~ -9deg
const int US_MAX = 2550;  // ~ +189deg
const int US_0   = 544;   // pulse at unit 0
const long US_PER_180 = 2400 - 544;

// Convert a working "unit" (~degrees, may be negative or >180) to a clamped
// pulse width.
int usFromUnit(int u) {
  long us = US_0 + (long)u * US_PER_180 / 180;
  if (us < US_MIN) us = US_MIN;
  if (us > US_MAX) us = US_MAX;
  return (int)us;
}

// Per-finger software limits (units, may be negative). MUTABLE — set via "L".
// Start wide (bounded by the pulse window) so calibration can explore; tighten
// to the real hardstops via "Configure hand".
int limMin[N] = { -15, -15, -15, -15, -15, -15 };
int limMax[N] = { 195, 195, 195, 195, 195, 195 };

const int JOG_STEP = 5;
const unsigned long HEARTBEAT_MS = 1000;

// Commanded target per finger (display/telemetry). Initialized to mid-range for
// display only — NOT written to the servos on boot.
int target[N]    = { 90, 90, 90, 90, 90, 90 };
int written[N]   = { 90, 90, 90, 90, 90, 90 };  // last value actually written
bool attached[N] = { false, false, false, false, false, false };

const int LINE_MAX = 48;
char lineBuf[LINE_MAX];
int  lineLen = 0;
unsigned long lastHeartbeat = 0;

int clampi(int v, int lo, int hi) {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

// Attach a servo lazily and drive it to its current target. The first command
// to a finger is the only thing that starts PWM on that pin.
void driveServo(int i) {
  if (!attached[i]) {
    servos[i].attach(SERVO_PIN[i], US_MIN, US_MAX);
    attached[i] = true;
  }
  servos[i].writeMicroseconds(usFromUnit(target[i]));
  written[i] = target[i];
}

// Stop driving a servo: detach and hold its signal pin LOW so a powered servo
// on a floating line can't twitch on noise.
void relaxServo(int i) {
  if (attached[i]) {
    servos[i].detach();
    attached[i] = false;
  }
  pinMode(SERVO_PIN[i], OUTPUT);
  digitalWrite(SERVO_PIN[i], LOW);
}

void relaxAll() {
  for (int i = 0; i < N; i++) relaxServo(i);
  Serial.println("relaxed");
}

void printAngles() {
  for (int i = 0; i < N; i++) {
    Serial.print(target[i]);
    Serial.print(i < N - 1 ? ' ' : '\n');
  }
}

void printLimits() {
  Serial.print("LIM ");
  for (int i = 0; i < N; i++) {
    Serial.print(limMin[i]); Serial.print(' ');
    Serial.print(limMax[i]);
    Serial.print(i < N - 1 ? ' ' : '\n');
  }
}

void setup() {
  Serial.begin(9600);
  for (int i = 0; i < N; i++) {
    pinMode(SERVO_PIN[i], OUTPUT);
    digitalWrite(SERVO_PIN[i], LOW);   // quiet, defined idle — not driven
  }
  Serial.println("hand_control ready (servos relaxed)");
  printAngles();
}

// "n I D" — nudge finger I by signed D degrees.
bool applyNudge(const char *s) {
  int i, d;
  if (sscanf(s + 1, "%d %d", &i, &d) != 2) return false;
  if (i < 0 || i >= N) return false;
  target[i] = clampi(target[i] + d, limMin[i], limMax[i]);
  driveServo(i);
  return true;
}

// "j I A" — set finger I to absolute angle A.
bool applyJoint(const char *s) {
  int i, a;
  if (sscanf(s + 1, "%d %d", &i, &a) != 2) return false;
  if (i < 0 || i >= N) return false;
  target[i] = clampi(a, limMin[i], limMax[i]);
  driveServo(i);
  return true;
}

// "L I A B" — set finger I limits (does not move the finger).
bool applyLimit(const char *s) {
  int i, a, b;
  if (sscanf(s + 1, "%d %d %d", &i, &a, &b) != 3) return false;
  if (i < 0 || i >= N) return false;
  limMin[i] = a < b ? a : b;
  limMax[i] = a < b ? b : a;
  target[i] = clampi(target[i], limMin[i], limMax[i]);  // clamp only, no drive
  return true;
}

bool applyPose(const char *s) {
  int v[N];
  int n = sscanf(s, "%d %d %d %d %d %d", &v[0], &v[1], &v[2], &v[3], &v[4], &v[5]);
  if (n != N) return false;
  for (int i = 0; i < N; i++) {
    int c = clampi(v[i], limMin[i], limMax[i]);
    if (c != written[i]) { target[i] = c; driveServo(i); }
    else                 { target[i] = c; }
  }
  return true;
}

int jogTarget(char c, int &dir) {
  switch (c) {
    case 'q': case 'Q': dir = -1; return 0;
    case 'a': case 'A': dir = +1; return 0;
    case 'w': case 'W': dir = -1; return 1;
    case 's': case 'S': dir = +1; return 1;
    case 'e': case 'E': dir = -1; return 2;
    case 'd': case 'D': dir = +1; return 2;
    case 'f': case 'F': dir = -1; return 3;
    case 'r': case 'R': dir = +1; return 3;
    case 't': case 'T': dir = -1; return 4;
    case 'g': case 'G': dir = +1; return 4;
    case 'u': case 'U': dir = -1; return 5;
    case 'y': case 'Y': dir = +1; return 5;
    default: return -1;
  }
}

bool applyJog(char c) {
  int dir = 0;
  int i = jogTarget(c, dir);
  if (i < 0) return false;
  target[i] = clampi(target[i] + dir * JOG_STEP, limMin[i], limMax[i]);
  driveServo(i);
  return true;
}

void handleLine(char *s) {
  while (*s == ' ' || *s == '\t' || *s == '\r') s++;
  if (*s == '\0') return;

  if (*s == '?') { printAngles(); return; }
  if (*s == 'l') { printLimits(); return; }
  if (*s == 'x' || *s == 'X') { relaxAll(); return; }
  if (*s == 'n' || *s == 'N') { if (applyNudge(s)) printAngles(); return; }
  if (*s == 'j' || *s == 'J') { if (applyJoint(s)) printAngles(); return; }
  if (*s == 'L')              { if (applyLimit(s)) printLimits(); return; }

  if (*s == '-' || (*s >= '0' && *s <= '9')) {
    if (applyPose(s)) printAngles();
    return;
  }

  if (applyJog(*s)) printAngles();
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
      lineLen = 0;
    }
  }

  unsigned long now = millis();
  if (now - lastHeartbeat >= HEARTBEAT_MS) {
    lastHeartbeat = now;
    printAngles();
  }
}
