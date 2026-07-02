#include <Servo.h>;

Servo servothumb; // Define thumb servo
Servo servoindex; // Define index servo
Servo middle;
Servo servoringfinger;
Servo servopinky;
Servo servowrist;
Servo servobiceps;
Servo servorotate;
Servo servoshoulder;
Servo servoomoplat;
Servo servoneck;
Servo servorothead;
char c;

int Open = 150;
int Close = 50;

//Fingers start closed
int rightThumb = 160;
int rightIndex = 170;
int rightMiddle = 160;
int rightRing = 0;
int rightPinky = 160;
int rightWrist = 90;

int i = 10;

void setup() {
servothumb.attach(2); // Set thumb servo to digital pin 2
servoindex.attach(3); // Set index servo to digital pin 3
middle.attach(4);
servoringfinger.attach(5);
servopinky.attach(6);
servowrist.attach(7);
servobiceps.attach(8);
servorotate.attach(9);
servoshoulder.attach(10);
servoomoplat.attach(11);
servoneck.attach(12);
servorothead.attach(13);
Serial.begin(9600);
Serial.print("setup complete");
}
 
void loop() { // Loop through motion tests
c = Serial.read();
Serial.print(rightThumb);
Serial.print(' ');
Serial.print(rightIndex);
Serial.print(' ');
Serial.print(rightMiddle);
Serial.print(' ');
Serial.print(rightRing);
Serial.print(' ');
Serial.print(rightPinky);
Serial.print(' ');
Serial.println(rightWrist);

if (c=='q' || c=='Q'){rightThumb = rightThumb-i < 60 ? 60 : rightThumb-i;}
else if (c=='a' || c=='A') {rightThumb = rightThumb+i > 180 ? 180 : rightThumb+i;}
else if (c=='w' || c=='W') {rightIndex = rightIndex-i < 40 ? 40 : rightIndex-i;}
else if (c=='s' || c=='S') {rightIndex = rightIndex+i > 180 ? 180 : rightIndex+i;}
else if (c=='e' || c=='E') {rightMiddle = rightMiddle-i < 30 ? 30 : rightMiddle-i;}
else if (c=='d' || c=='D') {rightMiddle = rightMiddle+i > 180 ? 180 : rightMiddle+i;}
else if (c=='r' || c=='R') {rightRing = rightRing+i > 150 ? 150 : rightRing+i;}
else if (c=='f' || c=='F') {rightRing = rightRing-i < 0 ? 0 : rightRing-i;}
else if (c=='t' || c=='T') {rightPinky = rightPinky-i < 40 ? 40 : rightPinky-i;}
else if (c=='g' || c=='G') {rightPinky = rightPinky+i > 180 ? 180 : rightPinky+i;}
else if (c=='y'){rightWrist = rightWrist+i > 180 ? 180 : rightWrist+i;}
else if (c=='u'){rightWrist = rightWrist-i < 0 ? 0 : rightWrist-i;}

alltovirtual(); // Example: alltovirtual
delay(40); // Wait 4000 milliseconds (.04 seconds)
//alltorest(); // Uncomment to use this
//delay(4000); // Uncomment to use this
//alltomax(); // Uncomment to use this
//delay(2000); // Uncomment to use this
//allto90(); // Uncomment to use this
//delay(2000); // Uncomment to use this
 
}
// Motion to set the servo into "virtual" 0 position: alltovirtual
void alltovirtual() {
servothumb.write(rightThumb);
servoindex.write(rightIndex);
middle.write(rightMiddle);
servoringfinger.write(rightRing);
servopinky.write(rightPinky);
servowrist.write(rightWrist);
servobiceps.write(0);
servorotate.write(20); //Never less then (20 degree)
servoshoulder.write(30); //Never less then (30 degree)
servoomoplat.write(10); //Never less then (10 degree)
servoneck.write(0);
servorothead.write(0);
}
// Motion to set the servo into " ()" position: alltorest
void alltorest() {
servothumb.write(0);
servoindex.write(0);
middle.write(0);
servoringfinger.write(0);
servopinky.write(0);
servowrist.write(0);
servobiceps.write(0);
servorotate.write(90); //Never less then (20 degree)
servoshoulder.write(30); //Never less then (30 degree)
servoomoplat.write(10); //Never less then (10 degree)
servoneck.write(90);
servorothead.write(90);
}
 
// Motion to set the servo into "max" position: alltomax
void alltomax() {
servothumb.write(180);
servoindex.write(180);
middle.write(180);
servoringfinger.write(180);
servopinky.write(180);
servowrist.write(180);
servobiceps.write(85); //Never more then (85 or 90degree)
servorotate.write(110); //Never more then (110 degree)
servoshoulder.write(130); //Never more then (130 degree)
servoomoplat.write(70); //Never more then (70 degree)
servoneck.write(180);
servorothead.write(180);
 
}
 
// Motion to set the servo into "90" position: allto90
void allto90() {
servothumb.write(90);
servoindex.write(90);
middle.write(90);
servoringfinger.write(90);
servopinky.write(90);
servowrist.write(90);
servobiceps.write(90); //Never more then (85 or 90degree)
servorotate.write(90); //Never more then (110 degree)
servoshoulder.write(90); //Never more then (130 degree)
servoomoplat.write(70); //Never more then (70 degree)
servoneck.write(90);
servorothead.write(180);
 
}