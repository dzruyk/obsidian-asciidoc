import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TextFileView, TFile } from 'obsidian';
import { ItemView, ViewStateResult, WorkspaceLeaf } from 'obsidian';
import { Component, editorInfoField } from 'obsidian';

import AsciidocPlugin from "./main"

import asciidoctor from 'asciidoctor'

import Mark from 'mark.js'

export const ASCIIDOC_EDITOR_VIEW = "asciidoc-editor-view";

import "codemirror-asciidoc"
import CodeMirror from 'codemirror'

import 'codemirror/addon/selection/active-line.js'
import 'codemirror/addon/display/fullscreen.js'
import 'codemirror/addon/display/fullscreen.css'
import 'codemirror/addon/selection/mark-selection.js'
import 'codemirror/addon/search/searchcursor.js'
import 'codemirror/addon/search/search.js'
import 'codemirror/addon/scroll/annotatescrollbar.js'
import 'codemirror/addon/search/matchesonscrollbar.js'
import 'codemirror/addon/dialog/dialog.js'
import 'codemirror/addon/hint/show-hint.js'
import 'codemirror/addon/fold/foldcode.js'
import 'codemirror/addon/fold/foldgutter.js'
import 'codemirror/addon/fold/foldgutter.css'

//import 'codemirror/lib/codemirror.css'

function isValidUrl(str: string): boolean {
  let url;
  try {
    url = new URL(str);
  } catch (_) {
    return false;
  }
  return true
}

function deleteChildNodes(el: any) {
    while (el.hasChildNodes())
      el.removeChild(el.children[0]);
}

let isEditMode = true;

export class AsciidocView extends TextFileView {
  private pageData: string; //TODO: for view-only mode
  private plugin: AsciidocPlugin;
  private div: any;
  private options: any;
  private adoc: any;
  private cm: any;
  private mark: any;
  private isSearchActive: boolean;

  constructor(plugin: AsciidocPlugin, leaf: WorkspaceLeaf) {
    super(leaf);
    this.plugin = plugin;
    this.div = null;
    this.isSearchActive = false;
    console.log("CONSTRUCTOR")

    // For viewer mode
    this.adoc = asciidoctor();
    this.options = {
      standalone: false,
      safe: 'safe',
      attributes: { 'showtitle': true, 'icons': 'font' }
    };
    this.mark = null;

    let tmp = document.createElement("div");
    // @ts-ignore
    this.cm = CodeMirror(tmp,
    {
      tabSize: 2,
      mode: "asciidoc",
      lineNumbers: true,
      lineWrapping: true,
      // @ts-ignore
      line: true,
      styleActiveLine: true,
      highlightSelectionMatches: {
        annotateScrollbar: true
      },
      viewportMargin: 2,
      inputStyle: 'contenteditable',
      allowDropFileTypes: ['image/jpg', 'image/png', 'image/svg', 'image/jpeg', 'image/gif'],
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter']
    })

    this.addAction("book-open", "preview/editor mode", (evt: MouseEvent ) => { this.changeViewMode() });
  }

  changeViewMode() {
    isEditMode = !isEditMode;
    console.log("change edit mode ", isEditMode);
    deleteChildNodes(this.div);
    this.isSearchActive = false;
    this.renderCurrentMode();
  }

  renderCurrentMode() {
    if (!this.div) {
      console.log("SHOULD NOT REACH");
    }

    if (isEditMode) {
      console.log("render editor");
      this.div.appendChild(this.cm.getWrapperElement());
      this.cm.refresh();
    } else {
      console.log("render viewer");
      this.div.appendChild(this.renderViewerMode());
    }
  }

  renderViewerMode() {
    let contents = this.cm.getValue();
    let htmlStr = this.adoc.convert(contents, this.options);

    let parser = new window.DOMParser();
    let dom = document.createElement("div");

    dom.innerHTML = htmlStr;
    let collection = dom.getElementsByTagName("a");

    while (collection.length > 0) {
      let item = collection[0];

      let txt = item.getText().trim();
      let cls = "cm-hmd-internal-link";
      if (isValidUrl(txt)) {
        cls = "cm-url";
      }
      let s = `<span class="${cls}" spellcheck="false"><span class="cm-underline" draggable="true"> ${txt} </span></span>`;
      let div = document.createElement('div');
      div.innerHTML = s;
      if (item.parentNode) {
        item.parentNode.replaceChild(div, item);
      }

      div.onclick = () => {
        console.log(`CLICK ${txt}`);
        this.app.workspace.openLinkText(txt, '', false);
      }
    }
    this.mark = new Mark(dom);
    return dom;
  }

  renderSearchDialog() {
    let cm = this.cm;

    let searchDialog = '<span class="CodeMirror-search-label">' + cm.phrase("Search:") + '</span> <input type="text" style="width: 10em" class="CodeMirror-search-field"/> <span style="color: #888" class="CodeMirror-search-hint"></span>';

    let item = document.createElement("div");
    item.className = "CodeMirror-dialog-top";
    item.innerHTML = searchDialog;

    let root = document.createElement("div");
    root.className = "CodeMirror-dialog";
    root.innerHTML = item.outerHTML;
    this.div.insertBefore(root, this.div.children[0])

    let collection = root.getElementsByTagName("input");
    collection[0].focus();

    collection[0].addEventListener("keyup", (e: KeyboardEvent) => {
      if (e.keyCode == 13)
        this.doSearch(collection[0].value);
    }, true)

    this.isSearchActive = true;
  }

  doSearch(val: string) {
    this.mark.unmark();
    this.mark.mark(val, { separateWordSearch: false } );
    let elements = this.div.getElementsByTagName("mark");
    if (elements.length)
      elements[0].scrollIntoView();
  }

  async onOpen() {
    await super.onOpen();
  }

  async onLoadFile(file: TFile) {
    console.log("onLoadFile", isEditMode);

    if (this.div == null)
      this.div = this.contentEl.createEl("div", { cls: "adoc-view" });

    this.renderCurrentMode()
    this.addKeyEvents();
    await super.onLoadFile(file);
  }

  async onUnloadFile(file: TFile) {
    console.log("onUnloadFile ", isEditMode)
    window.removeEventListener('keydown', this.keyHandle, true);
    await super.onUnloadFile(file);
    deleteChildNodes(this.div);
  }

  async onClose() {
    await super.onClose();
    console.log("onClose")
  }

  onResize() {
  }

  getContext(file?: TFile) {
    return file?.path ?? this.file?.path;
  }

  getViewType() {
    return ASCIIDOC_EDITOR_VIEW;
  }

  getViewData = () => {
    return this.cm.getValue();
  }

  setViewData = (data: string, clear: boolean) => {
    console.log(`setViewData ${clear} buf = ${data.substr(0, 10)}`)
    this.pageData = data;
    this.cm.setValue(data)
    if (isEditMode)
      this.cm.refresh();
    if (clear) {
      if (!isEditMode) {
        deleteChildNodes(this.div);
        this.div.appendChild(this.renderViewerMode());
      }
    }
  }

  clear = () => {
    this.cm.setValue("")
  }

  addKeyEvents() {
    window.addEventListener('keydown', this.keyHandle, true);
  }

  private keyHandle = (event: KeyboardEvent) => {
    if (app.workspace.activeLeaf != this.leaf)
      return;

    type myCallback = () => void;
    const ctrlMap = new Map<number, myCallback >([
      /* "f" */ [70, () => { this.commandFind() } ],
      /* "e" */ [69, () => { this.changeViewMode() } ],

    ]);
    if (event.ctrlKey) {
      const cb = ctrlMap.get(event.keyCode);
      if (cb)
        cb()
    } else if (event.key == 'Escape') {
      this.commandEsc()
    }
  }

  commandFind() {
    if (isEditMode) {
      CodeMirror.commands.find(this.cm);
    } else {
      if (this.isSearchActive) {
        let collection = this.div.getElementsByTagName("input");
        if (collection.length)
          collection[0].focus();
        return;
      }
      this.renderSearchDialog();
    }
  }

  commandEsc() {
    console.log('esc')
    if (isEditMode)
      return;
    if (!this.isSearchActive)
      return;

    this.div.removeChild(this.div.children[0]);
    this.isSearchActive = false;
  }
}

