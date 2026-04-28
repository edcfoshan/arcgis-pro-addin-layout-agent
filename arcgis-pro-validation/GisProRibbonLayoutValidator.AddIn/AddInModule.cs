using ArcGIS.Desktop.Framework;
using ArcGIS.Desktop.Framework.Contracts;

namespace GisProRibbonLayoutValidator.AddIn;

internal sealed class AddInModule : Module
{
    private static AddInModule? _this;

    public static AddInModule Current => _this ??= (AddInModule)FrameworkApplication.FindModule("GisProRibbonLayoutValidator_AddIn_Module");

    protected override bool CanUnload()
    {
        return true;
    }
}
