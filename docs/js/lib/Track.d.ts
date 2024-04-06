import AudioSourceNode from './AudioSourceNode.js';
import { AudioAdjustmentOptions } from './automation.js';
/**
 * Type representing a beat of a Track. Contains cancellation logic so third-parties can cancel specific
 * beat rules on a given Track. Also used for passing beat events to callbacks.
 */
export type TrackBeat = {
    time: number;
    isCancelled: boolean;
    /**
     * Cancels future beat events generated by this TrackBeat on a best-case basis.
     *
     * If the beat event was already scheduled, it may cause third-party listeners to be called anyway.
     * Tracks will always double-check that the TrackBeat they synchronized to was still active at the time,
     * rapidly stopping playback. In the worst case, a synchronized track may be audible for a brief moment.
     */
    cancel(): void;
};
/**
 * Enumeration for track beat types. If writing with TypeScript, use these.
 */
export declare enum TrackBeatType {
    /**
     * Repeating beat, firing every `S + xR` seconds where S is the start point and R is the repeat seconds
     */
    REPEATING = "repeating",
    /**
     * Precise beat, fires on an exact time
     */
    PRECISE = "precise",
    /**
     * Exclusion region, beats that would fire in this region... won't fire
     */
    EXCLUDE = "exclude"
}
/**
 * Enumeration for track event types. If writing with TypeScript, use these.
 *
 * Deprecation Notice: Depending on how these are used or misused, some may be removed, added, or change
 * in future versions. In general, you should never tie any game logic to these events. Only use the
 * events for sound-specific things.
 */
export declare enum TrackEventType {
    /**
     * Fires when a track is scheduling to start playback.
     * - `startPlayback(track, startOptions)` => ({@link Track}, {@link AudioAdjustmentOptions})
     */
    START_PLAYBACK = "startPlayback",
    /**
     * Fires when a track is scheduling to stop playback. If you need to fire when a playing AudioSource
     * goes silent, i.e. when it truly stops playing, use the {@link SILENCED} event instead.
     * - `stopPlayback(track, stopOptions)` => ({@link Track}, {@link AudioAdjustmentOptions})
     */
    STOP_PLAYBACK = "stopPlayback",
    /**
     * - `beat(track, beat)` => ({@link Track}, {@link TrackBeat})
     */
    BEAT = "beat",
    /**
     * Fires regularly from `requestAnimFrame()`. Naturally, this creates a performance hit the more
     * callbacks are tied to this event. If you have any sort of complexity, it's strongly suggested
     * to run your own rendering pipeline and directly access
     * - `position(track, time)` => ({@link Track}, `number`)
     */
    POSITION = "position",
    /**
     * Fires when a playing AudioSource goes silent, i.e. its no longer playing. This uses the built-in
     * "ended" event on AudioBufferSourceNodes.
     * - `silenced(track, time)` => ({@link Track}, `number`)
     */
    SILENCED = "silenced"
}
export declare enum TrackSwapType {
    /**
     * Ramps in the new source and then ramps out the old source
     */
    IN_OUT = "inOut",
    /**
     * Ramps out the old source and then ramps in the new source
     */
    OUT_IN = "outIn",
    /**
     * Ramps both sources at the same time
     */
    CROSS = "cross",
    /**
     * Cuts directly from old source to the new source
     */
    CUT = "cut"
}
/**
 * Simple adjustment options to use when swapping between two AudioSources on a track.
 * Includes all options from AudioAdjustmentOptions.
 */
export type TrackSwapOptions = AudioAdjustmentOptions & {
    /**
     * Order of operation when swapping sources
     */
    swap: TrackSwapType | null;
    /**
     * Delay between the end of the old source and the start of the new source.
     * To achieve the effect, implementations add the delay and duration of the
     * adjustment to this value, and use it as the starting delay on the new source.
     */
    swapDelay?: number;
};
/**
 * Advanced swap specification for swapping between two AudioSources on a track.
 * Both adjustments are applied simultaneously to each source. Internally, one
 * of these is produced from given {@link TrackSwapOptions} and used for swapping.
 */
export type TrackSwapAdvancedOptions = {
    oldSource: Required<AudioAdjustmentOptions>;
    newSource: Required<AudioAdjustmentOptions>;
};
/**
 * Track interface
 */
interface Track {
    /**
     * Begin playback on the track, starting the loaded AudioSource.
     *
     * Implementation Notes:
     * - When both `delay` and `options.delay` are provided, they are added together.
     * - If this call follows a `loadSource()`, it will call `swap()` using a default OUT_IN swap.
     *   Merge the passed options with the default swap. Use `swap()` directly for more control.
     * - If the AudioSource attached to this Track is already playing, clone it as a new loaded source
     *   and call `swap()`, merging the passed options with the default swap options as above.
     * - Using `duration` is equivalent to calling `start(delay, options)` and then `stop(delay + duration)`
     * @param delay optional delay time
     * @param options adjustment parameters
     * @param duration how long to play before stopping
     * @returns {Track} this Track
     */
    start(delay?: number, options?: AudioAdjustmentOptions, duration?: number): Track;
    /**
     * Stop playback on the track, pausing the currently playing AudioSource.
     *
     * Implementation Notes:
     * - When both `delay` and `options.delay` are provided, they are added together.
     * - Does nothing if there is no playing AudioSource.
     * - Saves the playhead position of the AudioSource at the time this method is called,
     *   so that a future `start()` call will resume from the saved position.
     * @param delay optional delay time
     * @param options adjustment parameters
     * @returns {Track} this Track
     */
    stop(delay?: number, options?: AudioAdjustmentOptions): Track;
    /**
     * Loads and immediately starts playback of an audio source.
     *
     * Implementation Notes:
     * - If this call follows another `playSource()`, or a `start()`, it will call
     *   `swap()` using the given `options`. Use `swap()` directly for more control.
     * - This should call `loadSource(path)`, then `swap(options)`
     * @param path audio source path
     * @param options adjustment parameters
     * @returns {AudioSourceNode} the new AudioSource
     */
    playSource(path: string, options?: AudioAdjustmentOptions): AudioSourceNode;
    /**
     * Loads an audio source and returns it. The audio source will be linked to this track, so that
     * calling `start()` will play the last loaded audio source. You may use this to load a second
     * audio source while one is already playing, it will not be swapped until a call to `start()`
     * or `swap()` is made.
     * @param path audio source path
     * @returns {AudioSourceNode} the new AudioSource
     */
    loadSource(path: string): AudioSourceNode;
    /**
     * Swaps the currently playing AudioSource with the loaded AudioSource.
     *
     * Implementation Notes:
     * - After this method returns, all methods that modify the AudioSource of this Track will
     *   modify the new source that has been swapped in.
     * @param options swap parameters
     * @returns {Track} this Track
     */
    swap(options?: TrackSwapOptions | TrackSwapAdvancedOptions): Track;
    /**
     * Set the volume of this track.
     * @param volume gain multiplier
     * @param options adjustment parameters
     * @returns {Track} this Track
     */
    volume(volume: number, options?: AudioAdjustmentOptions): Track;
    /**
     * Enabled/ disable a loop, and set timings.
     *
     * Implementation Notes:
     * - Uses the AudioBufferSourceNode built-in looping parameters directly
     * @param enabled true to enable looping
     * @param startSample point to loop back to, must be before `endSample`
     * @param endSample trigger point for the loop, must be after `startSample`
     * @returns {Track} this Track
     */
    loop(enabled: boolean, startSample?: number, endSample?: number): Track;
    /**
     * Enable/ disable a jump, and set timings.
     *
     * Implementation Notes:
     * - Uses a custom implementation that looks ahead to find the `fromSample`,
     *   then schedules a CUT swap to the `toSample`. As a result, this can also
     *   be used for looping, but that is provided separately so both can be used
     *   at the same time.
     * @param enabled true to enable jumping
     * @param fromSample trigger point for the jump
     * @param toSample point to jump to
     * @returns {Track} this Track
     */
    jump(enabled: boolean, fromSample?: number, toSample?: number): Track;
    /**
     * Create a beat rule and return it.
     *
     * Calling multiple times will stack beat rules. Use sparingly!
     * Returned TrackBeat can be used to cancel it later.
     * @param type beat type
     * @param origin origin point for this beat or range
     * @param period duration (exclude) or period (repeating), or does nothing (precise)
     * @returns {TrackBeat} the created TrackBeat
     */
    createBeat(type: TrackBeatType, origin: number, period?: number): TrackBeat;
    /**
     * Clears all beats on this track and cancels them
     * @returns {Track} this Track
     */
    clearBeats(): Track;
    /**
     * Schedules this track to start playback precisely when the given track generates a beat.
     * @param track track
     * @param options adjustment parameters
     * @returns {Track} this Track
     */
    syncPlayTo(track: Track, options?: AudioAdjustmentOptions): Track;
    /**
     * Schedules this track to stop playback precisely when the given track generates a beat.
     *
     * It is possible to synchronize a track to stop to itself.
     * @param track track
     * @param options adjustment parameters
     * @returns {Track} this Track
     */
    syncStopTo(track: Track, options?: AudioAdjustmentOptions): Track;
    /**
     * Assigns a callback to be called for the event. The first arguement is always the calling track.
     * @param type event to listen for
     * @param callback async function to execute
     * @returns {Track} this Track
     */
    listenFor(type: TrackEventType, callback: Promise<any>): Track;
}
/**
 * Track implementation
 */
declare class TrackSingle implements Track {
    private readonly name;
    private readonly audioContext;
    readonly destination: AudioNode;
    readonly source: AudioSourceNode;
    private readonly gainNode;
    private loadedSource?;
    private playingSource?;
    private isLoadSourceCalled;
    constructor(name: string, audioContext: AudioContext, destination: AudioNode, source: AudioSourceNode);
    toString(): string;
    start(delay?: number, options?: AudioAdjustmentOptions, duration?: number): Track;
    stop(delay?: number, options?: AudioAdjustmentOptions): Track;
    playSource(path: string, options?: AudioAdjustmentOptions): AudioSourceNode;
    loadSource(path: string): AudioSourceNode;
    swap(options?: TrackSwapOptions | TrackSwapAdvancedOptions): Track;
    volume(volume: number, options?: AudioAdjustmentOptions): Track;
    loop(enabled: boolean, startSample?: number, endSample?: number): Track;
    jump(enabled: boolean, fromSample?: number, toSample?: number): Track;
    createBeat(type: TrackBeatType, origin: number, period?: number): TrackBeat;
    clearBeats(): Track;
    syncPlayTo(track: Track, options?: AudioAdjustmentOptions): Track;
    syncStopTo(track: Track, options?: AudioAdjustmentOptions): Track;
    listenFor(type: TrackEventType, callback: Promise<any>): Track;
    private get _time();
}
/**
 * TrackGroup. All TrackGroups are constructed with a primary Track that shares the same name as the group,
 * to which most methods will operate as a transparent call onto the primary Track. Unless otherwise stated
 * by the method's documentation, assume it acts directly onto the primary Track.
 */
declare class TrackGroup implements Track {
    private readonly name;
    private readonly audioContext;
    readonly destination: AudioNode;
    private readonly source;
    private tracks;
    private readonly gainNode;
    constructor(name: string, audioContext: AudioContext, destination: AudioNode, source: AudioSourceNode);
    toString(): string;
    /**
     * Retrieve a track by its name.
     *
     * @param name track name
     * @returns {Track} if found, `undefined` otherwise
     */
    track(name: string): Track | undefined;
    /**
     * Retrieve the primary Track for this TrackGroup. It will share the name of this TrackGroup
     * and is guaranteed* to exist.
     *
     * \* Unless you do some funny business and delete it!
     *
     * @returns {Track} the primary Track of this TrackGroup
     */
    primaryTrack(): Track;
    /**
     * Add a new track to this group.
     * @param name name of the track
     * @param path path to audio source
     * @param source loaded audio source
     * @returns {Track} the new Track
     */
    newTrack(name: string, path?: string, source?: AudioSourceNode): Track;
    /**
     * Starts playback of all tracks in this group.
     */
    start(delay?: number, options?: AudioAdjustmentOptions, duration?: number): Track;
    /**
     * Stops playback of all tracks in this group.
     */
    stop(delay?: number, options?: AudioAdjustmentOptions): Track;
    playSource(path: string, options?: AudioAdjustmentOptions): AudioSourceNode;
    loadSource(path: string): AudioSourceNode;
    swap(options?: TrackSwapOptions | TrackSwapAdvancedOptions): Track;
    /**
     * Adjusts the volume output of this group.
     */
    volume(volume: number, options?: AudioAdjustmentOptions): Track;
    loop(enabled: boolean, startSample?: number, endSample?: number): Track;
    jump(enabled: boolean, fromSample?: number, toSample?: number): Track;
    createBeat(type: TrackBeatType, origin: number, period?: number): TrackBeat;
    /**
     * Clears beats across all tracks in the group.
     */
    clearBeats(): Track;
    /**
     * Synchronizes playback of all tracks in the group.
     */
    syncPlayTo(track: Track, options?: AudioAdjustmentOptions): Track;
    /**
     * Synchronizes stopping of all track in the group.
     */
    syncStopTo(track: Track, options?: AudioAdjustmentOptions): Track;
    listenFor(type: TrackEventType, callback: Promise<any>): Track;
}
export default TrackSingle;
export { Track, TrackGroup };
