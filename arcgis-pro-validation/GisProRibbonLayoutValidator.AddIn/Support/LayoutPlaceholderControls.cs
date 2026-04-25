using System;
using System.Collections.ObjectModel;
using System.Threading.Tasks;
using ArcGIS.Desktop.Framework.Contracts;
using ArcGIS.Desktop.Framework.Dialogs;

namespace GisProRibbonLayoutValidator.AddIn.Generated;

internal abstract class LayoutButtonBase : Button
{
    private readonly string _caption;
    private readonly string _handlerName;
    private readonly string _target;

    protected LayoutButtonBase(string caption, string handlerName, string target)
    {
        _caption = caption;
        _handlerName = handlerName;
        _target = target;
    }

    protected override void OnClick()
    {
        var summary =
            $"当前按钮仅用于验证 Ribbon 布局。{Environment.NewLine}{Environment.NewLine}" +
            $"标题：{_caption}{Environment.NewLine}" +
            $"建议映射类：{_handlerName}{Environment.NewLine}" +
            $"目标区域：{_target}";

        MessageBox.Show(summary, "Ribbon Layout Validator");
    }
}

internal abstract class LayoutToolBase : Tool
{
    private readonly string _caption;
    private readonly string _handlerName;
    private readonly string _target;

    protected LayoutToolBase(string caption, string handlerName, string target)
    {
        _caption = caption;
        _handlerName = handlerName;
        _target = target;
    }

    protected override Task OnActivateAsync(bool active)
    {
        if (!active)
            return Task.CompletedTask;

        var summary =
            $"当前工具仅用于验证 Ribbon 布局。{Environment.NewLine}{Environment.NewLine}" +
            $"标题：{_caption}{Environment.NewLine}" +
            $"建议映射类：{_handlerName}{Environment.NewLine}" +
            $"目标区域：{_target}";

        MessageBox.Show(summary, "Ribbon Layout Validator");
        return Task.CompletedTask;
    }
}

internal abstract class LayoutCheckBoxBase : CheckBox
{
    private readonly string _caption;
    private readonly string _handlerName;

    protected LayoutCheckBoxBase(string caption, string handlerName)
    {
        _caption = caption;
        _handlerName = handlerName;
    }

    protected override void OnClick()
    {
        var wasChecked = IsChecked ?? false;
        var isChecked = !wasChecked;
        IsChecked = isChecked;

        var summary =
            $"当前复选框仅用于验证 Ribbon 布局。{Environment.NewLine}{Environment.NewLine}" +
            $"标题：{_caption}{Environment.NewLine}" +
            $"建议映射类：{_handlerName}{Environment.NewLine}" +
            $"当前状态：{(isChecked ? "已勾选" : "未勾选")}";

        MessageBox.Show(summary, "Ribbon Layout Validator");
    }
}

internal abstract class LayoutComboBoxBase : ComboBox
{
    private readonly string _caption;
    private readonly string _handlerName;

    protected LayoutComboBoxBase(string caption, string handlerName, string[] items)
    {
        _caption = caption;
        _handlerName = handlerName;

        foreach (var item in items)
        {
            Add(new ComboBoxItem(item));
        }

        if (items.Length > 0)
        {
            Text = items[0];
        }
    }

    protected override void OnSelectionChange(ComboBoxItem item)
    {
        Text = item?.Text ?? string.Empty;

        var summary =
            $"当前下拉框仅用于验证 Ribbon 布局。{Environment.NewLine}{Environment.NewLine}" +
            $"标题：{_caption}{Environment.NewLine}" +
            $"建议映射类：{_handlerName}{Environment.NewLine}" +
            $"当前选中：{Text}";

        MessageBox.Show(summary, "Ribbon Layout Validator");
    }
}

internal abstract class LayoutEditBoxBase : EditBox
{
    private readonly string _caption;
    private readonly string _handlerName;

    protected LayoutEditBoxBase(string caption, string handlerName, string defaultText)
    {
        _caption = caption;
        _handlerName = handlerName;
        Text = defaultText;
    }

    protected override void OnEnter()
    {
        var summary =
            $"当前输入框仅用于验证 Ribbon 布局。{Environment.NewLine}{Environment.NewLine}" +
            $"标题：{_caption}{Environment.NewLine}" +
            $"建议映射类：{_handlerName}{Environment.NewLine}" +
            $"当前内容：{Text}";

        MessageBox.Show(summary, "Ribbon Layout Validator");
    }
}

internal abstract class LayoutGalleryBase : Gallery
{
    private readonly string _caption;
    private readonly string _handlerName;

    protected LayoutGalleryBase(string caption, string handlerName, string[] items)
    {
        _caption = caption;
        _handlerName = handlerName;

        var collection = new ObservableCollection<object>();
        foreach (var item in items)
        {
            collection.Add(new GalleryItem(item, null, "布局验证", item));
        }

        SetItemCollection(collection);
    }

    protected override void OnClick(GalleryItem item)
    {
        var summary =
            $"当前画廊仅用于验证 Ribbon 布局。{Environment.NewLine}{Environment.NewLine}" +
            $"标题：{_caption}{Environment.NewLine}" +
            $"建议映射类：{_handlerName}{Environment.NewLine}" +
            $"当前选中：{item?.Caption}";

        MessageBox.Show(summary, "Ribbon Layout Validator");
    }
}
