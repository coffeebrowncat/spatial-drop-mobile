import React, { useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';

// dim, static field of tiny stars for atmosphere
export const StaticStarfield = () => {
  const [stars] = useState(() => Array.from({ length: 80 }).map(() => ({
    x: Math.random() * Dimensions.get('window').width,
    y: Math.random() * Dimensions.get('window').height,
    size: Math.random() * 2 + 1,
    opacity: Math.random() * 0.15 + 0.05
  })));

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: -1 }]} pointerEvents="none">
      {stars.map((star, i) => (
        <View key={i} style={{
          position: 'absolute',
          left: star.x,
          top: star.y,
          width: star.size,
          height: star.size,
          borderRadius: star.size / 2,
          backgroundColor: '#888888',
          opacity: star.opacity
        }} />
      ))}
    </View>
  );
};