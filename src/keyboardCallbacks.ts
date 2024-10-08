import { Hotkey, Modifier } from 'obsidian';

type myCallback = () => void;

export class KeyInfo {
  keyName: string
  mask: number

  constructor(keyName: string, isShift: boolean = false, isCtrl: boolean = false, isAlt: boolean = false) {
    this.keyName = keyName;
    //assume this is some keyboard key
    if (this.keyName.length == 1)
      this.keyName = "Key" + this.keyName.toUpperCase();
    this.mask = this.modifiersToMask(isShift, isCtrl, isAlt);
  }

  modifiersToMask(isShift: boolean = false, isCtrl: boolean = false, isAlt: boolean = false): number {
    let modifiers = 0;
    if (isShift)
      modifiers |= 1;
    if (isCtrl)
      modifiers |= 2;
    if (isAlt)
      modifiers |= 4;
    return modifiers;
  }

  static fromHotkey(hk: Hotkey) {
    let keyName = hk.key;
    let checkModifier = (modName: Modifier) => hk.modifiers.includes(modName);
    return new KeyInfo(keyName, checkModifier("Shift"), checkModifier("Mod"), checkModifier("Alt"));
  }

  matchEventModifiers(event: KeyboardEvent): boolean {
    let mask = this.modifiersToMask(event.shiftKey, event.ctrlKey, event.altKey);
    if ((this.mask & mask) == this.mask)
      return true;
    return false;
  }
}

export class KeyboardCallbacks {
  keyMap: Map<string, KeyInfo>;
  callbacks: Map<string, myCallback>;

  constructor() {
    this.keyMap = new Map<string, KeyInfo>()
    this.callbacks = new Map<string, myCallback>()
  }

  registerKey(ki: KeyInfo, callback: myCallback) {
    this.keyMap.set(ki.keyName, ki);
    this.callbacks.set(ki.keyName, callback);
  }

  registerObsidianHotkey(hk: Hotkey, defaultKey: KeyInfo, callback: myCallback) {
    let ki: KeyInfo;
    if (hk) {
      ki = KeyInfo.fromHotkey(hk);
    } else {
      ki = defaultKey;
    }
    this.registerKey(ki, callback);
  }

  handleKeyboardEvent(event: KeyboardEvent) {
    let ki = this.keyMap.get(event.code);
    if (!ki)
      return;
    if (ki.matchEventModifiers(event)) {
      const cb = this.callbacks.get(ki.keyName);
      if (cb)
        cb();
    }
  }
}

