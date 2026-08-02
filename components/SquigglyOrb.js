import React, { useState, useEffect } from 'react';
import { Circle, Path } from 'react-native-svg';
import { AnimatedLine, AnimatedCircle } from './AnimatedPrimitives'; // Pulling in your existing animated shapes!

export const SquigglyOrb = ({ cx, cy, radius, color, pulseAnim }) => {
  const [time, setTime] = useState(0);

  useEffect(() => {
    let id;
    const startTime = Date.now();
    const loop = () => {
      setTime((Date.now() - startTime) / 1000);
      id = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(id);
  }, []);

  const numLines =20; 
  const pointsPerLine = 120; 
  const speed = 15;
  const squiggleAmount = 0.01; 
  const squiggleFrequency = 9;
  const squiggleSpeed = 2;

  const paths = [];

  for (let lineIdx = 0; lineIdx < numLines; lineIdx++) {
    const timeOffset = (lineIdx / numLines) * speed;
    const progress = ((time + timeOffset) % speed) / speed;
    const latitude = progress * Math.PI; 
    const circleRadius = Math.sin(latitude) * radius;
    const yPosition = -Math.cos(latitude) * radius; 
    const longitudeRotation = (lineIdx / numLines) * Math.PI;

    let pathD = '';

    for (let i = 0; i <= pointsPerLine; i++) {
      const angle = (i / pointsPerLine) * Math.PI * 2;
      const squiggle = Math.sin(angle * squiggleFrequency + time * squiggleSpeed + lineIdx * 0.5) * squiggleAmount;
      const radiusSquiggle = Math.cos(angle * squiggleFrequency * 1.3 + time * squiggleSpeed * 0.8) * squiggleAmount * 1.2;
      const displacedRadius = circleRadius + (squiggle + radiusSquiggle) * circleRadius;
      const ySquiggle = Math.sin(angle * squiggleFrequency * 0.7 + time * squiggleSpeed * 1.2) * squiggleAmount * 0.4;

      const x = Math.cos(angle) * displacedRadius;
      const y = yPosition + ySquiggle * circleRadius;
      const z = Math.sin(angle) * displacedRadius;

      const worldX = x * Math.cos(longitudeRotation) + z * Math.sin(longitudeRotation);
      const worldZ = -x * Math.sin(longitudeRotation) + z * Math.cos(longitudeRotation);

      const camDistance = 2000; 
      const scale = camDistance / (camDistance + worldZ);
      const screenX = cx + worldX * scale;
      const screenY = cy + y * scale;

      if (i === 0) {
        pathD += `M ${screenX} ${screenY} `;
      } else {
        pathD += `L ${screenX} ${screenY} `;
      }
    }
    paths.push(pathD);
  }

  return (
    <React.Fragment>
      <Circle cx={cx} cy={cy} r={radius} fill="url(#youGrad)" opacity={1} />
      {paths.map((d, i) => (
        <Path key={`orb-line-${i}`} d={d} stroke={color} strokeWidth={2} fill="none" opacity={0.6} />
      ))}
      <AnimatedLine x1={cx} y1={cy - 80} x2={cx} y2={cy + 320} stroke={color} strokeWidth={0} strokeDasharray="4, 8" opacity={pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.8] })} />
      <AnimatedCircle cx={cx} cy={cy} r={pulseAnim.interpolate({ inputRange: [4, 25], outputRange: [3, 9] })} fill={color} opacity={0.9} />
    </React.Fragment>
  );
};