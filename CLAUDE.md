# Draw Party - Claude Code Context & Development Guide

## 📋 Project Overview

**Draw Party** is a multiplayer online drawing game designed for party gameplay. The core concept is simple: players take turns drawing prompts while others guess what they're drawing, followed by voting to determine the correct answer.

### 🎯 Core Design Principles
- **30-Second Rule**: Any feature must be explainable in 30 seconds or less
- **KISS (Keep It Simple, Stupid)**: Simple to learn, hard to put down
- **Party-First**: Every decision optimized for group fun and social interaction
- **Zero Learning Curve**: Grandma should be able to join and play immediately

## 🏗️ Technical Architecture

### Single-File Application
- **Primary File**: `index.html` (~2000+ lines)
- **Architecture**: Everything embedded (HTML, CSS, JavaScript)
- **Rationale**: Ultra-portable, no build process, works anywhere

### Key Technologies
- **Frontend**: HTML5 Canvas, Tailwind CSS, JavaScript ES6+
- **Networking**: PeerJS for WebRTC P2P connections
- **PWA**: Service Worker (`sw.js`), Web App Manifest (`manifest.json`)
- **Deployment**: GitHub Pages, Netlify, Vercel compatible

### Core Game Components
- **DrawingHistory Class**: Undo/redo functionality with 20-step buffer
- **DrawPartyGame Class**: Main game controller with state management
- **Timer System**: Phase-based countdown timers (90s/45s/30s)
- **Performance Optimizations**: 60fps drawing, throttled networking, device testing

## 🎮 Game Flow (Completed)

### Phase 1: Drawing
- Each player draws their assigned prompt simultaneously
- Only the artist can see their prompt and draw
- Real-time performance optimization with drawing buffers

### Phase 2: Guessing
- Players view each drawing and submit text guesses
- Input validation and automatic submission checking

### Phase 3: Voting
- Multiple choice voting (correct answer + player guesses + decoys)
- Visual feedback and automatic advancement

### Phase 4: Results
- Score calculation with celebration animations
- Artist points based on correct vote percentage
- Voter points for selecting correct answers

## 🔧 Gemini CLI Integration

### When to Use Gemini CLI
Claude Code has permission to use the Gemini CLI in non-interactive mode for large codebase analysis:

```bash
gemini -p "Your analysis prompt here"
```

### Use Cases for Gemini
1. **Large Codebase Analysis**: When you need to understand relationships across the entire 2000+ line codebase
2. **Performance Optimization**: Analyzing the complete drawing pipeline and networking code
3. **Bug Investigation**: When issues span multiple interconnected systems
4. **Architecture Review**: Understanding the complete game state management flow

### Effective Gemini Prompts
```bash
# Analyze complete game flow
gemini -p "Analyze the complete game loop in this Draw Party codebase. Focus on the phase transitions from drawing → guessing → voting → results. Identify any potential race conditions or state management issues."

# Performance analysis
gemini -p "Review the canvas drawing performance optimizations in this game. Look for bottlenecks in the drawing buffer system, animation loops, and network broadcasting. Suggest improvements for 60fps on mobile."

# Network architecture review
gemini -p "Examine the PeerJS networking implementation. Focus on connection stability, message handling, host migration, and error recovery. Identify potential failure points in party game scenarios."
```

### When NOT to Use Gemini
- **Simple File Reading**: Use Read tool for specific files
- **Small Code Changes**: Use Edit/MultiEdit for targeted modifications
- **Testing/Execution**: Gemini can't run code or test functionality

## 📱 Performance Considerations

### Mobile-First Approach
- **Device Testing**: Automatic performance testing and setting adjustment
- **Touch Optimization**: Passive event listeners, cached rectangle calculations
- **Battery Efficiency**: Capped device pixel ratio, optimized animation loops
- **Network Efficiency**: Throttled broadcasts (50ms intervals), compressed data

### Key Performance Metrics
- **Target**: 60fps drawing on 3+ year old mobile devices
- **Network Latency**: <100ms for drawing updates between players
- **Load Time**: <2 seconds initial game load
- **Memory**: <50MB during typical gameplay sessions

## 🎯 Current Priorities (GitHub Issues)

### Completed ✅
- **Core Game Loop Perfection** (#21): Complete Draw→Guess→Vote→Results flow

### Next Critical Issues
1. **🌐 Rock-Solid Networking** (#18): Handle real-world party scenarios (poor WiFi, player dropouts)
2. **⚡ Core Performance Optimization** (#17): Ensure 60fps across all devices
3. **🔧 Production Ready & Reliable** (#20): Zero crashes, graceful error handling

### Important but Secondary
- **🖌️ Simple Drawing Tools Polish** (#2): Basic tool improvements only
- **📱 Instant Access & Sharing** (#19): Frictionless joining experience
- **🎲 Large Group Support** (#16): Handle 8-20+ players

## 🚫 Explicitly Avoided Complexity

Based on KISS principles, these features were **intentionally removed** or **simplified**:

### Removed Features
- Advanced drawing tools (shapes, layers, complex brushes)
- Achievement/progression systems
- Analytics dashboards
- Complex game modes
- Internationalization (beyond basic accessibility)
- Marketing automation

### Simplified Features
- **Accessibility**: Basic keyboard nav and screen reader support only
- **UI/UX**: Clean polish without complex design systems
- **Documentation**: Minimal, focused on essential context only

## 🎪 Party Game Focus

### Success Metrics
- **Viral Coefficient**: How often players share with friends
- **Session Length**: 30-60 minutes without feeling long
- **Replay Desire**: 90%+ want to play "one more round"
- **Accessibility**: Anyone can join and start playing within 15 seconds

### Real-World Testing Priorities
1. **House Party WiFi**: Overloaded home networks
2. **Mixed Devices**: iOS/Android/desktop in same game
3. **Phone Interruptions**: Handle calls, app switching seamlessly
4. **Large Groups**: 8-20 players without performance degradation

## 💡 Development Tips

### Code Style
- **No comments unless essential**: Code should be self-documenting
- **Performance over elegance**: Party games must be responsive
- **Error recovery over prevention**: Graceful degradation for network issues
- **Mobile-first**: Always test touch interactions first

### Testing Strategy
- **Real Device Testing**: Use actual phones/tablets, not browser dev tools
- **Network Stress Testing**: Test on slow/unstable connections
- **Party Simulation**: Test with multiple real players simultaneously
- **Duration Testing**: Long sessions (2+ hours) for memory leaks

This context should help maintain the project's focus on creating a simple, addictive party game that prioritizes fun over complexity.