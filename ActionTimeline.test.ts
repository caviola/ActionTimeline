import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ActionTimeline from './ActionTimeline.ts';
import { type EmileOptions } from './emile.min.js';

describe('ActionTimeline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a new instance', () => {
    const tl = new ActionTimeline();
    expect(tl).toBeInstanceOf(ActionTimeline);
  });

  it('play returns true when in READY state', () => {
    const tl = new ActionTimeline();
    tl.call(() => {});
    expect(tl.play()).toBe(true);
  });

  it('play returns false when already playing', () => {
    const tl = new ActionTimeline();
    tl.call(() => {}).play();
    expect(tl.play()).toBe(false);
  });

  it('calls the function in a call action', () => {
    const fn = vi.fn();
    const tl = new ActionTimeline();
    tl.call(fn).play();
    vi.runAllTimers();
    expect(fn).toHaveBeenCalledOnce();
  });

  it('executes multiple call actions in sequence', () => {
    const order: number[] = [];
    const tl = new ActionTimeline();
    tl.call(() => order.push(1))
      .call(() => order.push(2))
      .call(() => order.push(3))
      .play();
    vi.runAllTimers();
    expect(order).toEqual([1, 2, 3]);
  });

  it('calls after callback when timeline finishes', () => {
    const afterFn = vi.fn();
    const tl = new ActionTimeline();
    tl.call(() => {})
      .after(afterFn)
      .play();
    vi.runAllTimers();
    expect(afterFn).toHaveBeenCalledOnce();
  });

  it('sleeps for the specified duration', () => {
    const fn = vi.fn();
    const tl = new ActionTimeline();
    tl.call(fn).sleep(1000).call(fn).play();

    vi.advanceTimersToNextTimer();
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersToNextTimer();
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersToNextTimer();
    vi.advanceTimersToNextTimer();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('supports method chaining', () => {
    const tl = new ActionTimeline();
    const result = tl
      .call(() => {})
      .sleep(100)
      .call(() => {});
    expect(result).toBe(tl);
  });

  it('stop returns true when playing', () => {
    const tl = new ActionTimeline();
    tl.call(() => {}).play();
    expect(tl.stop()).toBe(true);
  });

  it('stop returns false when ready', () => {
    const tl = new ActionTimeline();
    expect(tl.stop()).toBe(false);
  });

  it('rewind stops the timeline and resets position', () => {
    const fn = vi.fn();
    const tl = new ActionTimeline();
    tl.call(() => {})
      .sleep(100)
      .call(fn)
      .play();

    vi.advanceTimersByTime(50);
    tl.rewind();

    vi.runAllTimers();
    expect(fn).not.toHaveBeenCalled();
  });

  it('executes after callbacks even when queue is empty at play time', () => {
    const afterFn = vi.fn();
    const tl = new ActionTimeline();
    tl.call(() => {})
      .after(afterFn)
      .play();
    vi.runAllTimers();
    expect(afterFn).toHaveBeenCalledWith(tl);
  });

  it('does not call after callbacks when stopped before completion', () => {
    const afterFn = vi.fn();
    const tl = new ActionTimeline();
    tl.call(() => {})
      .sleep(100)
      .after(afterFn)
      .play();
    vi.advanceTimersByTime(50);
    tl.stop();
    vi.runAllTimers();
    expect(afterFn).not.toHaveBeenCalled();
  });

  it('calls after callback when timeline finishes with multiple actions', () => {
    const afterFn = vi.fn();
    const tl = new ActionTimeline();
    tl.call(() => {})
      .call(() => {})
      .call(() => {})
      .after(afterFn)
      .play();
    vi.runAllTimers();
    expect(afterFn).toHaveBeenCalledOnce();
  });

  it('waits for a callback before continuing', () => {
    const order: string[] = [];
    const tl = new ActionTimeline();

    tl.call(() => order.push('before'))
      .wait((done) => {
        order.push('wait');
        setTimeout(() => {
          order.push('done');
          done();
        }, 100);
      })
      .call(() => order.push('after'))
      .play();

    vi.advanceTimersToNextTimer();
    expect(order).toEqual(['before']);

    vi.advanceTimersToNextTimer();
    expect(order).toEqual(['before', 'wait']);

    vi.advanceTimersByTime(100);
    vi.runAllTimers();
    expect(order).toEqual(['before', 'wait', 'done', 'after']);
  });

  it('launches a callback and continues immediately', () => {
    const order: string[] = [];
    const afterFn = vi.fn();
    const tl = new ActionTimeline();

    tl.launch((done) => {
      order.push('launch');
      setTimeout(() => {
        order.push('done');
        done();
      }, 100);
    })
      .call(() => order.push('after-launch'))
      .after(afterFn)
      .play();

    vi.advanceTimersToNextTimer();
    expect(order).toEqual(['launch']);

    vi.advanceTimersToNextTimer();
    expect(order).toEqual(['launch', 'after-launch']);
    expect(afterFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    vi.runAllTimers();
    expect(order).toEqual(['launch', 'after-launch', 'done']);
    expect(afterFn).toHaveBeenCalledWith(tl);
  });

  it('waits for another timeline before continuing', () => {
    const order: string[] = [];
    const child = new ActionTimeline();
    const parent = new ActionTimeline();

    child.call(() => order.push('child'));

    parent
      .call(() => order.push('before'))
      .wait(child)
      .call(() => order.push('after'))
      .play();

    vi.runAllTimers();
    expect(order).toEqual(['before', 'child', 'after']);
  });

  it('launches another timeline and waits for it before finishing', () => {
    const order: string[] = [];
    const afterFn = vi.fn();
    const child = new ActionTimeline();
    const parent = new ActionTimeline();

    child.sleep(100).call(() => order.push('child'));

    parent
      .launch(child)
      .call(() => order.push('parent'))
      .after(afterFn)
      .play();

    vi.advanceTimersToNextTimer();
    expect(order).toEqual([]);

    vi.advanceTimersToNextTimer();
    expect(order).toEqual(['parent']);
    expect(afterFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    vi.runAllTimers();
    expect(order).toEqual(['parent', 'child']);
    expect(afterFn).toHaveBeenCalledWith(parent);
  });

  it('treats an empty waited timeline as completed', () => {
    const order: string[] = [];
    const child = new ActionTimeline();
    const parent = new ActionTimeline();

    parent
      .wait(child)
      .call(() => order.push('after'))
      .play();

    vi.runAllTimers();
    expect(order).toEqual(['after']);
    expect(parent.play()).toBe(true);
  });

  it('treats an empty launched timeline as completed', () => {
    const afterFn = vi.fn();
    const child = new ActionTimeline();
    const parent = new ActionTimeline();

    parent.launch(child).after(afterFn).play();

    vi.runAllTimers();
    expect(afterFn).toHaveBeenCalledWith(parent);
    expect(parent.play()).toBe(true);
  });

  it('continues when animations array is empty', () => {
    const fn = vi.fn();
    const afterFn = vi.fn();
    const tl = new ActionTimeline();

    tl.animate([]).call(fn).after(afterFn).play();

    vi.runAllTimers();

    expect(fn).toHaveBeenCalledOnce();
    expect(afterFn).toHaveBeenCalledWith(tl);
  });

  it('runs animations and respects delays and callbacks', async () => {
    // Spy on emile to simulate animation completion
    const emileModule = await import('./emile.min.js');
    const emileSpy = vi.spyOn(emileModule, 'default');

    // Make emile call the completion callback immediately
    emileSpy.mockImplementation(
      (
        el: HTMLElement,
        style: string,
        opts: EmileOptions | undefined,
        after: (() => void) | undefined,
      ) => {
        if (opts?.after) opts.after();
        if (after) after();
      },
    );

    const order: string[] = [];
    const el = document.createElement('div');

    const tl = new ActionTimeline();
    tl.animate([
      { el: el, style: 'opacity:0', opts: { duration: 100 } },
      { el: el, style: 'left:10px', opts: { delay: 50, after: () => order.push('after1') } },
    ])
      .call(() => order.push('after-all'))
      .play();

    // Run all timers to let animations and callbacks run
    vi.runAllTimers();

    expect(order).toContain('after1');
    expect(order).toContain('after-all');
    emileSpy.mockRestore();
  });

  it('passes the timeline instance to after callbacks', () => {
    const afterFn = vi.fn();
    const tl = new ActionTimeline();
    tl.call(() => {})
      .after(afterFn)
      .play();
    vi.runAllTimers();
    expect(afterFn).toHaveBeenCalledWith(tl);
  });

  it('does not execute after callback multiple times', () => {
    const afterFn = vi.fn();
    const tl = new ActionTimeline();
    tl.call(() => {})
      .after(afterFn)
      .play();
    vi.runAllTimers();
    tl.call(() => {}).play();
    vi.runAllTimers();
    expect(afterFn).toHaveBeenCalledTimes(1);
  });

  it('can replay after finishing', () => {
    const fn = vi.fn();
    const tl = new ActionTimeline();
    tl.call(fn).play();
    vi.runAllTimers();
    expect(fn).toHaveBeenCalledTimes(1);

    tl.play();
    vi.runAllTimers();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
