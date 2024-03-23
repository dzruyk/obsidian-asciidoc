import { App, Plugin, TFile, PluginSettingTab, Setting, Menu, MenuItem } from 'obsidian';

import { AdocNewFileModal } from './adocNewFileModal';
import { AsciidocView, ASCIIDOC_EDITOR_VIEW } from './asciidocView';

interface MyPluginSettings {
  mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
  mySetting: 'default'
}

export default class AsciidocPlugin extends Plugin {
  settings: MyPluginSettings;
  app: any;

  async onload() {
    await this.loadSettings();

    //this.cmExtension = []
    //this.registerEditorExtension([this.cmExtension]);
    //this.updateEditorExtensions();

    console.log("this.app.workspace")
    console.log(this.app.workspace)
    this.registerExtensions(["adoc", "asciidoc"], ASCIIDOC_EDITOR_VIEW);
    console.log(this)

    this.registerView(ASCIIDOC_EDITOR_VIEW, (leaf) => new AsciidocView(this, leaf))

    // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
    const statusBarItemEl = this.addStatusBarItem();
    statusBarItemEl.setText('Status Bar Text');

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
    // This adds a complex command that can check whether the current state of the app allows execution of the command
    this.addCommand({
      id: 'create-adoc',
      name: 'create new Asciidoc file',
    callback: () => {
      new AdocNewFileModal(this).open();
    }
      
    });


    // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
    this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
  }

  public updateEditorExtensions() {
    //this.cmExtension.length = 0;
    //this.cmExtension.push(ExamplePlugin)
    //this.cmExtension.push(asciidocEditorPlugin(/*this.app, this.index, this.settings, this.api*/));
    this.app.workspace.updateOptions();

  }

  onunload() {
    this.app.viewRegistry.unregisterExtensions([".adoc", ".asciidoc"]);
    //this.registerExtensions([".md"], 'markdown');
    this.app.workspace.detachLeavesOfType(ASCIIDOC_EDITOR_VIEW);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class SampleSettingTab extends PluginSettingTab {
  plugin: AsciidocPlugin;

  constructor(app: App, plugin: AsciidocPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const {containerEl} = this;

    containerEl.empty();

    new Setting(containerEl)
      .setName('Setting #1')
      .setDesc('It\'s a secret')
      .addText(text => text
        .setPlaceholder('Enter your secret')
        .setValue(this.plugin.settings.mySetting)
        .onChange(async (value) => {
          this.plugin.settings.mySetting = value;
          await this.plugin.saveSettings();
        }));
  }
}

