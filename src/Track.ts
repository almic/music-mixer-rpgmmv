import AudioSourceNode from './AudioSourceNode.js';
import automation, { AudioAdjustmentOptions } from './automation.js';
import buildOptions, * as defaults from './defaults.js';

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
export enum TrackBeatType {
    /**
     * Repeating beat, firing every `S + xR` seconds where S is the start point and R is the repeat seconds
     */
    REPEATING = 'repeating',

    /**
     * Precise beat, fires on an exact time
     */
    PRECISE = 'precise',

    /**
     * Exclusion region, beats that would fire in this region... won't fire
     */
    EXCLUDE = 'exclude',
}

/**
 * Enumeration for track event types. If writing with TypeScript, use these.
 *
 * Deprecation Notice: Depending on how these are used or misused, some may be removed, added, or change
 * in future versions. In general, you should never tie any game logic to these events. Only use the
 * events for sound-specific things.
 */
export enum TrackEventType {
    /**
     * Fires when a track is scheduling to start playback.
     * - `startPlayback(track, startOptions)` => ({@link Track}, {@link AudioAdjustmentOptions})
     */
    START_PLAYBACK = 'startPlayback',

    /**
     * Fires when a track is scheduling to stop playback. If you need to fire when a playing AudioSource
     * goes silent, i.e. when it truly stops playing, use the {@link SILENCED} event instead.
     * - `stopPlayback(track, stopOptions)` => ({@link Track}, {@link AudioAdjustmentOptions})
     */
    STOP_PLAYBACK = 'stopPlayback',

    /**
     * - `beat(track, beat)` => ({@link Track}, {@link TrackBeat})
     */
    BEAT = 'beat',

    /**
     * Fires regularly from `requestAnimFrame()`. Naturally, this creates a performance hit the more
     * callbacks are tied to this event. If you have any sort of complexity, it's strongly suggested
     * to run your own rendering pipeline and directly access
     * - `position(track, time)` => ({@link Track}, `number`)
     */
    POSITION = 'position',

    /**
     * Fires when a playing AudioSource goes silent, i.e. its no longer playing. This uses the built-in
     * "ended" event on AudioBufferSourceNodes.
     * - `silenced(track, time)` => ({@link Track}, `number`)
     */
    SILENCED = 'silenced',
}

export enum TrackSwapType {
    /**
     * Ramps in the new source and then ramps out the old source
     */
    IN_OUT = 'inOut',

    /**
     * Ramps out the old source and then ramps in the new source
     */
    OUT_IN = 'outIn',

    /**
     * Ramps both sources at the same time
     */
    CROSS = 'cross',

    /**
     * Cuts directly from old source to the new source
     */
    CUT = 'cut',
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
     * - If `options.delay` is provided, it will be used over `delay`.
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
     * - If `options.delay` is provided, it will be used over `delay`.
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
     * - After this method returns, the internal state of the Track will be restored as if the
     *   Track has been reconstructed with the previously loaded AudioSourceNode, and then start()
     *   was called.
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
class TrackSingle implements Track {
    private readonly gainNode: GainNode;
    private loadedSource?: AudioSourceNode;
    private playingSource?: AudioSourceNode;

    /**
     * Tracks whether or not the loadSource() method has previously been called,
     * used by start() to determine if a swap() or plain start() will occur.
     */
    private isLoadSourceCalled: boolean = false;

    /**
     * Implementation Notes:
     * - If the given AudioSourceNode has outgoing connections, they will be disconnected at the
     *   time this Track begins playback of the AudioSourceNode.
     * - Providing an AudioSourceNode that is controlled by another Track has undefined behavior.
     *   If you must reuse an AudioSourceNode that may be controlled by another Track, use the
     *   clone() method to obtain a new node.
     * @param name
     * @param audioContext
     * @param destination
     * @param source
     */
    constructor(
        private readonly name: string,
        private readonly audioContext: AudioContext,
        readonly destination: AudioNode,
        readonly source: AudioSourceNode,
    ) {
        this.gainNode = audioContext.createGain();
        this.gainNode.connect(destination);
        this.loadedSource = source;
    }

    public toString(): string {
        return `TrackSingle[${this.name}] with context ${this.audioContext} and source ${this.source}`;
    }

    public start(delay?: number, options?: AudioAdjustmentOptions, duration?: number): Track {
        // Implicitly load a copy of the same source to call swap
        if (this.playingSource && !this.loadedSource) {
            this.loadedSource = this.playingSource.clone();
            this.isLoadSourceCalled = true;
        }

        // Swap after loading a source with loadSource()
        if (this.isLoadSourceCalled && this.loadedSource) {
            const swapOptions = buildOptions(options, defaults.trackSwapDefault);

            this.swap(swapOptions);

            if (duration != undefined) {
                this.stop((options?.delay ?? delay ?? 0) + duration);
            }

            return this;
        }

        if (this.loadedSource) {
            this.loadedSource.disconnect();
            this.playingSource = this.loadedSource;
            this.playingSource.connect(this.gainNode);
            this.loadedSource = undefined;

            const startOptions = buildOptions(options, defaults.startImmediate);
            if (delay != undefined && options?.delay == undefined) {
                startOptions.delay += delay;
            }

            const currentGain = this.gainNode.gain.value;
            this.gainNode.gain.value = 0;
            this.playingSource.start(this._time + startOptions.delay);
            automation(this.audioContext, this.gainNode.gain, currentGain, startOptions);

            if (duration != undefined) {
                this.stop(startOptions.delay + duration);
            }

            return this;
        }

        console.warn('Track.start() called with no source loaded. This is likely a mistake.');
        return this;
    }

    public stop(delay?: number, options?: AudioAdjustmentOptions): Track {
        console.log(`stub stop with ${delay} seconds of delay with options ${options}`);
        return this;
    }

    public playSource(path: string, options?: AudioAdjustmentOptions): AudioSourceNode {
        console.log(`stub playSource at ${path} with ${options}`);
        const audioSource = this.loadSource(path);
        this.start(0, options);
        return audioSource;
    }

    public loadSource(path: string): AudioSourceNode {
        console.log(`stub loadSource at ${path}`);
        return new AudioSourceNode(this.audioContext, this.gainNode);
    }

    public swap(options?: TrackSwapOptions | TrackSwapAdvancedOptions): Track {
        console.log(`stub swap with ${options}`);
        return this;
    }

    public volume(volume: number, options?: AudioAdjustmentOptions): Track {
        console.log(`stub volume changed to ${volume} with ${options}`);
        return this;
    }

    public loop(enabled: boolean, startSample?: number, endSample?: number): Track {
        console.log(`stub loop ${enabled} in range ${startSample} to ${endSample}`);
        return this;
    }

    public jump(enabled: boolean, fromSample?: number, toSample?: number): Track {
        console.log(`stub jump ${enabled} from ${fromSample} to ${toSample}`);
        return this;
    }

    public createBeat(type: TrackBeatType, origin: number, period?: number): TrackBeat {
        console.log(`stub createBeat of ${type} at ${origin} with period ${period}`);
        return { time: 0, isCancelled: false, cancel: () => {} };
    }

    public clearBeats(): Track {
        console.log('stub clearBeats');
        return this;
    }

    public syncPlayTo(track: Track, options?: AudioAdjustmentOptions): Track {
        console.log(`stub syncPlayTo ${track} with options ${options}`);
        return this;
    }

    public syncStopTo(track: Track, options?: AudioAdjustmentOptions): Track {
        console.log(`stub syncStopTo ${track} with options ${options}`);
        return this;
    }

    public listenFor(type: TrackEventType, callback: Promise<any>): Track {
        console.log(`stub listenFor ${type} calling ${callback}`);
        return this;
    }

    private get _time(): number {
        return this.audioContext.currentTime;
    }
}

/**
 * TrackGroup. All TrackGroups are constructed with a primary Track that shares the same name as the group,
 * to which most methods will operate as a transparent call onto the primary Track. Unless otherwise stated
 * by the method's documentation, assume it acts directly onto the primary Track.
 */
class TrackGroup implements Track {
    private tracks: {
        [name: string]: Track;
    } = {};

    private readonly gainNode: GainNode;

    constructor(
        private readonly name: string,
        private readonly audioContext: AudioContext,
        readonly destination: AudioNode,
        private readonly source: AudioSourceNode,
    ) {
        this.gainNode = audioContext.createGain();
        this.gainNode.connect(destination);

        const track = new TrackSingle(name, audioContext, this.gainNode, source);
        this.tracks[name] = track;
    }

    toString(): string {
        return `TrackGroup[${this.name}] with context ${this.audioContext} and source ${this.source}`;
    }

    /**
     * Retrieve a track by its name.
     *
     * @param name track name
     * @returns {Track} if found, `undefined` otherwise
     */
    public track(name: string): Track | undefined {
        return this.tracks[name];
    }

    /**
     * Retrieve the primary Track for this TrackGroup. It will share the name of this TrackGroup
     * and is guaranteed* to exist.
     *
     * \* Unless you do some funny business and delete it!
     *
     * @returns {Track} the primary Track of this TrackGroup
     */
    public primaryTrack(): Track {
        return this.tracks[this.name] as Track;
    }

    /**
     * Add a new track to this group.
     * @param name name of the track
     * @param path path to audio source
     * @param source loaded audio source
     * @returns {Track} the new Track
     */
    public newTrack(name: string, path?: string, source?: AudioSourceNode): Track {
        if (name == this.name) {
            throw new Error(`Cannot use name "${name}" as it is the name of this group track`);
        }
        if (Object.keys(this.tracks).includes(name)) {
            throw new Error(`Cannot use name "${name}" as it already exists in this group track`);
        }
        let audioSource = source;
        if (!audioSource) {
            audioSource = new AudioSourceNode(this.audioContext, this.gainNode);
            if (path) {
                audioSource.load(path);
            }
        }
        const track = new TrackSingle(name, this.audioContext, this.gainNode, audioSource);
        this.tracks[name] = track;
        return track;
    }

    /**
     * Starts playback of all tracks in this group.
     */
    public start(delay?: number, options?: AudioAdjustmentOptions, duration?: number): Track {
        for (const track in this.tracks) {
            this.tracks[track]?.start(delay, options, duration);
        }
        return this;
    }

    /**
     * Stops playback of all tracks in this group.
     */
    public stop(delay?: number, options?: AudioAdjustmentOptions): Track {
        for (const track in this.tracks) {
            this.tracks[track]?.stop(delay, options);
        }
        return this;
    }

    public playSource(path: string, options?: AudioAdjustmentOptions): AudioSourceNode {
        return this.primaryTrack().playSource(path, options);
    }

    public loadSource(path: string): AudioSourceNode {
        return this.primaryTrack().loadSource(path);
    }

    public swap(options?: TrackSwapOptions | TrackSwapAdvancedOptions): Track {
        return this.primaryTrack().swap(options);
    }

    /**
     * Adjusts the volume output of this group.
     */
    public volume(volume: number, options?: AudioAdjustmentOptions): Track {
        console.log(`stub volume changed to ${volume} with ${options}`);
        return this;
    }

    public loop(enabled: boolean, startSample?: number, endSample?: number): Track {
        this.primaryTrack().loop(enabled, startSample, endSample);
        return this;
    }

    public jump(enabled: boolean, fromSample?: number, toSample?: number): Track {
        this.primaryTrack().jump(enabled, fromSample, toSample);
        return this;
    }

    public createBeat(type: TrackBeatType, origin: number, period?: number): TrackBeat {
        return this.primaryTrack().createBeat(type, origin, period);
    }

    /**
     * Clears beats across all tracks in the group.
     */
    public clearBeats(): Track {
        for (const track in this.tracks) {
            this.tracks[track]?.clearBeats();
        }
        return this;
    }

    /**
     * Synchronizes playback of all tracks in the group.
     */
    public syncPlayTo(track: Track, options?: AudioAdjustmentOptions): Track {
        for (const t in this.tracks) {
            this.tracks[t]?.syncPlayTo(track, options);
        }
        return this;
    }

    /**
     * Synchronizes stopping of all track in the group.
     */
    public syncStopTo(track: Track, options?: AudioAdjustmentOptions): Track {
        for (const t in this.tracks) {
            this.tracks[t]?.syncStopTo(track, options);
        }
        return this;
    }

    public listenFor(type: TrackEventType, callback: Promise<any>): Track {
        this.primaryTrack().listenFor(type, callback);
        return this;
    }
}

export default TrackSingle;
export { Track, TrackGroup };
