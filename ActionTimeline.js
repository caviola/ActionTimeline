/** 
 * The MIT License
 *
 * Copyright (c) 2013 Albert Almeida (caviola@gmail.com)
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
(function(name, container){
	var /** @const */READY    = 0,
	    /** @const */PLAYING  = 1,
	    /** @const */WAITING  = 2,
	    /** @const */STOPPING = 3,

	    /** @const */NODE     = 0,
	    /** @const */STYLES   = 1,
	    /** @const */OPTIONS  = 2;

	function _ActionTimeline(name) {
		this.name = name;
		this.queue = [];
		this.queueLength = 0;
		this.queuePosition = 0;
		this.pendingLaunches = 0;
		this.afters = [];
		this.state = READY;
		return this;
	}

	_ActionTimeline.READY    = READY;
	_ActionTimeline.PLAYING  = PLAYING;
	_ActionTimeline.WAITING  = WAITING;
	_ActionTimeline.STOPPING = STOPPING;

	/**
	 * This function is called asynchronously with setTimeout() to execute
	 * the action at the current queue positon.
	 * The code branch that handles each type of action is responsible for
	 * recalling this function when appropriate to execute the next action.
	 * For example, the code that handles the "sleep" action recalls this function
	 * after M milliseconds.
	 */
	_ActionTimeline.prototype._actionCallback = function() {
		if (this.state === STOPPING) {
			// Change to READY state only if all pending "launches" have finished.
			!this.pendingLaunches && this._ready();
			return;
		}

		// If reached the end of the queue we have no actions to execute and
		// we return to the caller.
		if (this.queuePosition >= this.queueLength) {
			!this.pendingLaunches && this._finished();
			return;
		}

		var action = this.queue[this.queuePosition];

		if (action.sleep) {
			// Advance to next action and recall us after "sleep" milliseconds.
			++this.queuePosition;
			setTimeout(this._actionCallback.bind(this), action.sleep);
		} else if (action.call) {
			// Call user function, advance to next action and recall us asap.
			(action.call)();
			++this.queuePosition;
			setTimeout(this._actionCallback.bind(this), 0);
		} else if (action.animations) {
			// Start all animations in the set in parallel delaying a given animation
			// if requested.
			action.pendingAnimations = action.animations.length;
			for(var i = 0, a; i < action.pendingAnimations && (a = action.animations[i]); i++) {
				if (a[OPTIONS] && a[OPTIONS].delay) {
					setTimeout(function(){
						emile(a[NODE], a[STYLES], a[OPTIONS], this._afterAnimationCallback.bind(this));
					}.bind(this), a[OPTIONS].delay);
				} else {
					emile(a[NODE], a[STYLES], a[OPTIONS], this._afterAnimationCallback.bind(this));
				}
			}
		} else if (action.launch) {
			++this.pendingLaunches;
			// If we are "launching" another ActionTimeline, add a completion
			// callback to it so that we are notified when it finishes and
			// then start it.
			if (action.launch instanceof ActionTimeline) {
				action.launch.
					after(this._notifyLaunch.bind(this)).
					play();
			} else {
				(action.launch)(_notifyLaunch.bind(this));
			}
			// Advance to the next action.
			++this.queuePosition;
			setTimeout(this._actionCallback.bind(this), 0);
		} else if (action.wait) {
			this.state = WAITING;
			
			// Move the pointer to the next action now so that if we are
			// stopped/restarted while waiting we continue with the next action.
			++this.queuePosition;

			// If we are "waiting" for another ActionTimeline, add a completion
			// callback to it so that we are notified when it finishes and
			// then start it.
			if (action.wait instanceof ActionTimeline) {
				action.wait.
					after(this._notifyWait.bind(this)).
					play();
			} else {
				(action.wait)(this._notifyWait.bind(this));
			}
		}
	};

	/**
	 * This will be called after the completion of each animation in the current
	 * set to decrement the "animations left" counter.
	 * When it reaches zero, we move on to next action.
	 */
	_ActionTimeline.prototype._afterAnimationCallback = function() {
		if (--this.queue[this.queuePosition].pendingAnimations)
			return; // we still have pending animations in the set

		// At this point all parallel animations in the set have finished.
		
		if (this.state === STOPPING) {
			// Change to READY state only if all pending "launches" have finished.
			!this.pendingLaunches && this._ready();
		} else {
			// Advance to next action.
			++this.queuePosition;
			setTimeout(this._actionCallback.bind(this), 0);
		}
	};

	_ActionTimeline.prototype._notifyLaunch = function() {
		if (--this.pendingLaunches) // are there pending "launches"?
			return;

		// At this point all pending "launches" have finished.
		// If we are stopping, we now can safely change to READY state.
		if (this.state === STOPPING) {
			this._ready();
			return;
		}

		if (this.queuePosition >= this.queueLength) {
			this._finished();
		}
	};

	_ActionTimeline.prototype._notifyWait = function() {
		// If we are not stopping, continue with the next action.
		if (this.state !== STOPPING) {
			this.state = PLAYING;
			setTimeout(this._actionCallback.bind(this), 0);
		} else {
			// We are stopping.
			// Change to READY state only if all pending "launches" have finished.
			!this.pendingLaunches && this._ready();
		}
	};

	_ActionTimeline.prototype._ready = function() {
		this.state = READY;
	};

  	/**
	 * This function is called when we have executed all actions in the timeline.
	 */
	_ActionTimeline.prototype._finished = function() {
		// Execute all "after" callbacks.
		for(var i = 0, len = this.afters.length; i < len; i++) {
			this.afters[i] && (this.afters[i])(this);
		}
		this.rewind();
		this._ready();
	};

	_ActionTimeline.prototype.call = function(fn, args) {
		this.queue.push({call: fn});
		return this;
	};

	_ActionTimeline.prototype.wait = function(fn) {
		this.queue.push({wait: fn});
		return this;
	};

	_ActionTimeline.prototype.launch = function(fn) {
		this.queue.push({launch: fn});
		return this;
	};

	_ActionTimeline.prototype.animate = function(anims) {
		this.queue.push({animations: anims});
		return this;
	};

	_ActionTimeline.prototype.sleep = function(milliseconds) {
		this.queue.push({sleep: milliseconds});
		return this;
	};

	_ActionTimeline.prototype.after = function(fn) {
		this.afters.push(fn);
		return this;
	};

	_ActionTimeline.prototype.play = function() {
		if (this.state !== READY)
			return false;

		this.queueLength = this.queue.length;
		if (!this.queueLength)
			return false;

		this.state = PLAYING;
		setTimeout(this._actionCallback.bind(this), 0);

		return true;
	};

	_ActionTimeline.prototype.stop = function() {
		if (this.state !== PLAYING && this.state !== WAITING)
			return false;

		this.state = STOPPING;
		return true;
	};

	_ActionTimeline.prototype.rewind = function() {
		this.stop();
		this.queuePosition = 0;
	};

	container[name] = _ActionTimeline;

})("ActionTimeline", this);
