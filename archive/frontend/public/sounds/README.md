# Abby Voice Assistant Sound Effects

This directory contains the sound effects used by Abby for voice interactions. These sounds are designed to be subtle, professional, and appropriate for a healthcare setting.

## Required Sound Files

1. `activation.mp3`
   - Played when Abby is activated by the wake word "Hey Abby"
   - Duration: ~200ms
   - Style: Gentle, ascending chime
   - Volume: Soft (peak -12dB)

2. `processing.mp3`
   - Played when Abby is processing a voice command
   - Duration: ~100ms
   - Style: Subtle tick or soft click
   - Volume: Very soft (peak -18dB)

3. `error.mp3`
   - Played when a command isn't recognized or there's an error
   - Duration: ~300ms
   - Style: Soft, descending tone
   - Volume: Soft (peak -12dB)

## Sound Design Guidelines

- All sounds should be:
  - Short and non-intrusive
  - Professional and clean
  - Consistent with Abby's helpful personality
  - Appropriate for a healthcare environment
  - Mixed to similar volume levels
  - High-quality (44.1kHz, 16-bit minimum)
  - Compressed to MP3 format (192kbps minimum)

## Accessibility Considerations

- All sounds should be:
  - Distinct and easily distinguishable
  - Not jarring or startling
  - Audible but not overpowering
  - Frequency-balanced to be clear on various devices
  - Tested with different hearing abilities

## Implementation Notes

1. Sound files are loaded and cached on startup by the AudioFeedbackService
2. Volume levels can be adjusted through VOICE_CONFIG.audio.volume
3. Sounds can be disabled entirely through VOICE_CONFIG.audio.enabled
4. Each sound is played through the Web Audio API for precise timing and control
5. Fallback silence is used if sound files are missing or audio is disabled

## Development Guidelines

1. Test sounds in different environments:
   - Quiet office settings
   - Busy clinical environments
   - Various device speakers
   - Different volume levels

2. Consider creating variations for:
   - Different time of day (quieter at night)
   - Different contexts (clinical vs. administrative)
   - Different user preferences

3. Maintain consistency:
   - Keep the sound family cohesive
   - Use similar processing and effects
   - Maintain consistent volume levels

## Production Requirements

Before deploying to production:
1. Ensure all sounds are properly licensed for commercial use
2. Test on target devices and environments
3. Validate accessibility with diverse user groups
4. Optimize file sizes while maintaining quality
5. Include fallback behavior for missing files

## Attribution

These sounds should be replaced with properly licensed or custom-created sounds before production use. Consider:
- Creating custom sounds with a sound designer
- Licensing from a professional sound library
- Using open-source sounds with appropriate licensing

## Future Enhancements

Consider adding sounds for:
- Command completion success
- Different types of errors
- System status changes
- Notifications
- Voice synthesis start/end

Always maintain the principle of minimal, professional audio feedback that enhances rather than distracts from the user experience.
