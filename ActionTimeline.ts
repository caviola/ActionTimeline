/**
 * The MIT License
 *
 * Copyright (c) 2013-2026 Albert Almeida (caviola@gmail.com)
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 * LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 * WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import emile from './emile.min.js';
import { type EmileOptions } from './emile.min.js';

type LaunchOrWaitTarget = ActionTimeline | ((done: VoidFunction) => void);

type AfterCallback = (action: ActionTimeline) => void;

type TimelineState = 'playing' | 'ready' | 'stopping' | 'waiting';

type AnimationOptions = {
  el: HTMLElement;
  style: string;
  opts?: EmileOptions;
};

type QueueAction =
  | { type: 'sleep'; delay: number }
  | { type: 'call'; fn: VoidFunction }
  | {
      type: 'animations';
      animations: AnimationOptions[];
    }
  | { type: 'launch'; target: LaunchOrWaitTarget }
  | { type: 'wait'; target: LaunchOrWaitTarget };

export default class ActionTimeline {
  private queue: QueueAction[] = [];
  private queueLength: number = 0;
  private queuePosition: number = 0;
  private pendingLaunches: number = 0;
  private pendingAnimations: number = 0;
  private afters: AfterCallback[] = [];
  private state: TimelineState = 'ready';

  private scheduleNextAction(delay = 0): void {
    ++this.queuePosition;
    setTimeout(() => this.actionCallback(), delay);
  }

  /**
   * This function is called asynchronously with setTimeout() to execute
   * the action at the current queue position.
   * The code branch that handles each type of action is responsible for
   * recalling this function when appropriate to execute the next action.
   * For example, the code that handles the "sleep" action recalls this function
   * after M milliseconds.
   */
  private actionCallback(): void {
    if (this.state === 'stopping') {
      // Change to READY state only if all pending "launches" have finished.
      if (!this.pendingLaunches) this.ready();
      return;
    }

    // If reached the end of the queue we have no actions to execute and
    // we return to the caller.
    if (this.queuePosition >= this.queueLength) {
      if (!this.pendingLaunches) this.finished();
      return;
    }

    const action = this.queue[this.queuePosition];

    switch (action.type) {
      case 'sleep':
        this.scheduleNextAction(action.delay);
        break;
      case 'call':
        action.fn();
        this.scheduleNextAction();
        break;
      case 'animations': {
        this.pendingAnimations = action.animations.length;
        if (this.pendingAnimations) {
          // Start all animations in the set in parallel delaying a given animation
          // if requested.
          for (const { el, style, opts } of action.animations) {
            if (opts?.delay) {
              setTimeout(() => {
                emile(el, style, opts, () => this.doneAnimationCallback());
              }, opts.delay);
            } else {
              emile(el, style, opts, () => this.doneAnimationCallback());
            }
          }
        } else {
          this.scheduleNextAction();
        }
        break;
      }
      case 'launch': {
        ++this.pendingLaunches;
        // If we are "launching" another ActionTimeline, add a completion
        // callback to it so that we are notified when it finishes and
        // then start it.
        if (action.target instanceof ActionTimeline) {
          action.target.after(() => this.doneLaunchCallback()).play();
        } else {
          action.target(() => this.doneLaunchCallback());
        }
        this.scheduleNextAction();
        break;
      }
      case 'wait': {
        this.state = 'waiting';

        // Move the pointer to the next action now so that if we are
        // stopped/restarted while waiting we continue with the next action.
        ++this.queuePosition;

        // If we are "waiting" for another ActionTimeline, add a completion
        // callback to it so that we are notified when it finishes and
        // then start it.
        if (action.target instanceof ActionTimeline) {
          action.target.after(() => this.doneWaitCallback()).play();
        } else {
          action.target(() => this.doneWaitCallback());
        }
        break;
      }
    }
  }

  /**
   * This will be called after the completion of each animation in the current
   * set to decrement the "animations left" counter.
   * When it reaches zero, we move on to next action.
   */
  private doneAnimationCallback(): void {
    if (--this.pendingAnimations) return; // we still have pending animations in the set

    // At this point all parallel animations in the set have finished.

    if (this.state === 'stopping') {
      // Change to READY state only if all pending "launches" have finished.
      if (!this.pendingLaunches) this.ready();
    } else {
      this.scheduleNextAction();
    }
  }

  private doneLaunchCallback(): void {
    // are there pending "launches"?
    if (--this.pendingLaunches) return;

    // At this point all pending "launches" have finished.
    // If we are stopping, we now can safely change to READY state.
    if (this.state === 'stopping') {
      this.ready();
      return;
    }

    if (this.queuePosition >= this.queueLength) {
      this.finished();
    }
  }

  private doneWaitCallback(): void {
    // If we are not stopping, continue with the next action.
    if (this.state !== 'stopping') {
      this.state = 'playing';
      setTimeout(() => this.actionCallback(), 0);
    } else {
      // We are stopping.
      // Change to READY state only if all pending "launches" have finished.
      if (!this.pendingLaunches) this.ready();
    }
  }

  private ready(): void {
    this.state = 'ready';
  }

  /**
   * This function is called when we have executed all actions in the timeline.
   */
  private finished(): void {
    // Execute all "after" callbacks.
    this.afters.forEach((after) => after(this));
    this.afters = [];
    this.rewind();
    this.ready();
  }

  call(fn: VoidFunction): this {
    this.queue.push({ type: 'call', fn });
    return this;
  }

  wait(target: LaunchOrWaitTarget): this {
    this.queue.push({ type: 'wait', target });
    return this;
  }

  launch(target: LaunchOrWaitTarget): this {
    this.queue.push({ type: 'launch', target });
    return this;
  }

  animate(anims: AnimationOptions[]): this {
    this.queue.push({ type: 'animations', animations: anims });
    return this;
  }

  sleep(milliseconds: number): this {
    this.queue.push({ type: 'sleep', delay: milliseconds });
    return this;
  }

  after(fn: AfterCallback): this {
    this.afters.push(fn);
    return this;
  }

  play(): boolean {
    if (this.state !== 'ready') return false;

    this.queueLength = this.queue.length;

    this.state = 'playing';
    setTimeout(() => this.actionCallback(), 0);

    return true;
  }

  stop(): boolean {
    if (this.state !== 'playing' && this.state !== 'waiting') return false;

    this.state = 'stopping';
    return true;
  }

  rewind(): boolean {
    if (this.stop()) {
      this.queuePosition = 0;
      return true;
    }
    return false;
  }
}
