import React, { useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { COLORS } from '../constants/colors';

const { width: windowWidth, height: windowHeight } = Dimensions.get('window');

// floating hex strings drifting behind the boarding screen
export const MatrixBackground = ({ typedName }) => {
  const hexes = ['0x8F', 'A1', 'B4', 'FF', '00', 'C9', 'E2', '7A', '562', 'B15CE', 'E38E2', '0x53', 'AE', '2954', 'CB176', 'E1', 'D3BB', '9C', '7A80', '615', 'C38', '0xDD', 'DFDD4', 'D8F1C'];
  // generate 50 random floating hex strings, once
  const [dataPoints] = useState(() => Array.from({ length: 50 }).map(() => ({
    x: Math.random() * windowWidth,
    y: Math.random() * windowHeight,
    text: hexes[Math.floor(Math.random() * hexes.length)],
    baseOpacity: 0.1 + Math.random() * 0.3
  })));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {dataPoints.map((point, i) => {
        // while typing, inject letters of the typed name into the stream randomly
        const isTyping = typedName.length > 0;
        const displayChar = (isTyping && Math.random() > 0.6)
          ? typedName[Math.floor(Math.random() * typedName.length)].toUpperCase()
          : point.text;

        return (
          <Text key={i} style={{
            position: 'absolute', left: point.x, top: point.y,
            fontFamily: 'Pliant', fontSize: 8, letterSpacing: 2,
            // shifts from dim grey to glowing amber while typing
            color: isTyping ? COLORS.idkman : COLORS.mutedText,
            opacity: isTyping ? point.baseOpacity + 0.5 : point.baseOpacity
          }}>
            {displayChar}
          </Text>
        );
      })}
    </View>
  );
};