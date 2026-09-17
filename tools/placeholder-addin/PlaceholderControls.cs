using ArcGIS.Desktop.Framework;
using ArcGIS.Desktop.Framework.Contracts;

namespace GisProRibbonLayoutValidator.AddIn
{
    internal sealed class AddInModule : Module
    {
        private static AddInModule? _this;

        public static AddInModule Current =>
            _this ??= (AddInModule)FrameworkApplication.FindModule("GisProRibbonLayoutValidator_AddIn_Module");

        protected override bool CanUnload() => true;
    }
}

// 免编译导出的固定占位行为类:DAML 生成器在 placeholderBehaviors 模式下
// 把所有控件的 className 统一指向这里,用户机器无需 .NET SDK 即可出包。
namespace Generated
{
    public sealed class PlaceholderButton : ArcGIS.Desktop.Framework.Contracts.Button
    {
        protected override void OnClick() { }
    }

    public sealed class PlaceholderTool : Tool
    {
    }

    public sealed class PlaceholderComboBox : ComboBox
    {
        public PlaceholderComboBox()
        {
            // 空下拉在 Pro 里渲染成灰条且点不开;种几个演示选项让占位控件可交互,
            // 观感接近真实控件(选项内容无业务含义,二开时替换为真实数据源)
            for (var i = 1; i <= 3; i++)
            {
                Add(new ComboBoxItem($"选项 {i}"));
            }
        }
    }

    public sealed class PlaceholderEditBox : EditBox
    {
    }

    public sealed class PlaceholderCheckBox : CheckBox
    {
    }

    public sealed class PlaceholderGallery : Gallery
    {
    }
}
