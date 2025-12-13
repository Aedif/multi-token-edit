class TrackerDialog extends Dialog {
  constructor(options, { total, cancelCallback, left, top }) {
    super(options, { left, top });
    this.count = 0;
    this.total = total;
    this.cancelCallback = cancelCallback;
  }

  incrementCount() {
    this.count++;
    this.element?.find('.count').html(this.count);
  }

  stop() {
    this.close(true);
  }

  get active() {
    return this._state === Application.RENDER_STATES.RENDERED || this._state === Application.RENDER_STATES.RENDERING;
  }
}

export async function trackProgress({ title = 'Progress', cancelCallback, total } = {}) {
  if (!total) return;

  let content = `
<div>
<div  style="display: block; text-align: center; padding: 5px;"><i class="fas fa-circle-notch fa-spin fa-3x"></i></div>
    <p style="text-align: center;"><span class="count">count</span>/${total}</p>
</div>`;

  const dialog = new TrackerDialog(
    {
      title,
      content,
      buttons: {
        cancel: {
          icon: '<i class="fas fa-stop"></i>',
          label: 'Stop/Cancel',
          callback: () => {
            cancelCallback?.();
          },
        },
      },
      default: 'cancel',
    },
    { total, cancelCallback, left: 50, top: 50 }
  );

  await dialog._render(true);

  return dialog;
}

export function countFolderItems(folder) {
  if (folder.contents) {
    return (
      folder.contents.length +
      folder.children.reduce(function (sum, ch) {
        return sum + countFolderItems(ch.folder);
      }, 0)
    );
  }
}
