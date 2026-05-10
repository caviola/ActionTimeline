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

export default class ActionTimeline {
  constructor() {
    this.queue = [];
    this.queueLength = 0;
    this.queuePosition = 0;
    this.pendingLaunches = 0;
    this.pendingAnimations = 0;
    this.afters = [];
    this.state = 'ready';
  }

  _scheduleNextAction(afterMilliseconds = 0) {
    ++this.queuePosition;
    setTimeout(() => this._actionCallback(), afterMilliseconds);
  }

  /**
   * This function is called asynchronously with setTimeout() to execute
   * the action at the current queue position.
   * The code branch that handles each type of action is responsible for
   * recalling this function when appropriate to execute the next action.
   * For example, the code that handles the "sleep" action recalls this function
   * after M milliseconds.
   */
  _actionCallback() {
    if (this.state === 'stopping') {
      // Change to READY state only if all pending "launches" have finished.
      if (!this.pendingLaunches) this._ready();
      return;
    }

    // If reached the end of the queue we have no actions to execute and
    // we return to the caller.
    if (this.queuePosition >= this.queueLength) {
      if (!this.pendingLaunches) this._finished();
      return;
    }

    const action = this.queue[this.queuePosition];

    if (action.sleep) {
      this._scheduleNextAction(action.sleep);
    } else if (action.call) {
      action.call();
      this._scheduleNextAction();
    } else if (action.animations) {
      this.pendingAnimations = action.animations.length;
      if (this.pendingAnimations) {
        // Start all animations in the set in parallel delaying a given animation
        // if requested.
        for (const [node, styles, options] of action.animations) {
          if (options?.delay) {
            setTimeout(() => {
              emile(node, styles, options, () => this._doneAnimationCallback());
            }, options.delay);
          } else {
            emile(node, styles, options, () => this._doneAnimationCallback());
          }
        }
      } else {
        this._scheduleNextAction();
      }
    } else if (action.launch) {
      ++this.pendingLaunches;
      // If we are "launching" another ActionTimeline, add a completion
      // callback to it so that we are notified when it finishes and
      // then start it.
      if (action.launch instanceof ActionTimeline) {
        action.launch.after(() => this._doneLaunchCallback()).play();
      } else {
        action.launch(() => this._doneLaunchCallback());
      }
      this._scheduleNextAction();
    } else if (action.wait) {
      this.state = 'waiting';

      // Move the pointer to the next action now so that if we are
      // stopped/restarted while waiting we continue with the next action.
      ++this.queuePosition;

      // If we are "waiting" for another ActionTimeline, add a completion
      // callback to it so that we are notified when it finishes and
      // then start it.
      if (action.wait instanceof ActionTimeline) {
        action.wait.after(() => this._doneWaitCallback()).play();
      } else {
        action.wait(() => this._doneWaitCallback());
      }
    }
  }

  /**
   * This will be called after the completion of each animation in the current
   * set to decrement the "animations left" counter.
   * When it reaches zero, we move on to next action.
   */
  _doneAnimationCallback() {
    if (--this.pendingAnimations) return; // we still have pending animations in the set

    // At this point all parallel animations in the set have finished.

    if (this.state === 'stopping') {
      // Change to READY state only if all pending "launches" have finished.
      if (!this.pendingLaunches) this._ready();
    } else {
      this._scheduleNextAction();
    }
  }

  _doneLaunchCallback() {
    // are there pending "launches"?
    if (--this.pendingLaunches) return;

    // At this point all pending "launches" have finished.
    // If we are stopping, we now can safely change to READY state.
    if (this.state === 'stopping') {
      this._ready();
      return;
    }

    if (this.queuePosition >= this.queueLength) {
      this._finished();
    }
  }

  _doneWaitCallback() {
    // If we are not stopping, continue with the next action.
    if (this.state !== 'stopping') {
      this.state = 'playing';
      setTimeout(() => this._actionCallback(), 0);
    } else {
      // We are stopping.
      // Change to READY state only if all pending "launches" have finished.
      if (!this.pendingLaunches) this._ready();
    }
  }

  _ready() {
    this.state = 'ready';
  }

  /**
   * This function is called when we have executed all actions in the timeline.
   */
  _finished() {
    // Execute all "after" callbacks.
    this.afters.forEach((after) => after(this));
    this.afters = [];
    this.rewind();
    this._ready();
  }

  call(fn) {
    this.queue.push({ call: fn });
    return this;
  }

  wait(fn) {
    this.queue.push({ wait: fn });
    return this;
  }

  launch(fn) {
    this.queue.push({ launch: fn });
    return this;
  }

  animate(anims) {
    this.queue.push({ animations: anims });
    return this;
  }

  sleep(milliseconds) {
    this.queue.push({ sleep: milliseconds });
    return this;
  }

  after(fn) {
    this.afters.push(fn);
    return this;
  }

  play() {
    if (this.state !== 'ready') return false;

    this.queueLength = this.queue.length;

    this.state = 'playing';
    setTimeout(() => this._actionCallback(), 0);

    return true;
  }

  stop() {
    if (this.state !== 'playing' && this.state !== 'waiting') return false;

    this.state = 'stopping';
    return true;
  }

  rewind() {
    if (this.stop()) {
      this.queuePosition = 0;
      return true;
    }
    return false;
  }
}
