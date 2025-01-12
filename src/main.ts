import { App, Plugin, TFile, PluginSettingTab, Setting, Menu, MenuItem } from 'obsidian';

import { AdocNewFileModal } from './adocNewFileModal';
import { AsciidocView, ASCIIDOC_EDITOR_VIEW } from './asciidocView';

export default class AsciidocPlugin extends Plugin {
  async onload() {
    this.registerExtensions(["adoc", "asciidoc"], ASCIIDOC_EDITOR_VIEW);
    this.registerView(ASCIIDOC_EDITOR_VIEW, (leaf) => new AsciidocView(this, leaf));

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file: TFile) => {
        menu.addItem((item: MenuItem) => {
          item
          .setTitle("New asciidoc file")
          .setIcon("scroll-text")
          .onClick(async () => {
            new AdocNewFileModal(this, file).open();
          });
        });
      })
    );

    this.addRibbonIcon('scroll-text', "New asciidoc file", () => {
        new AdocNewFileModal(this).open();
      });
      this.addCommand({
        id: 'create-adoc',
        name: 'create new Asciidoc file',
        callback: () => {
            new AdocNewFileModal(this).open();
        }
      });
  }

  public updateEditorExtensions() {
    this.app.workspace.updateOptions();
  }
}

