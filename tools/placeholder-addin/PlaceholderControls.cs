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
