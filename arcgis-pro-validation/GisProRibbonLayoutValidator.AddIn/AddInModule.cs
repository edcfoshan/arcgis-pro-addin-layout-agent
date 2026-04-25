using ArcGIS.Desktop.Framework;
using ArcGIS.Desktop.Framework.Contracts;

namespace GisProRibbonLayoutValidator.AddIn;

public class AddInModule : Module
{
    internal const string ModuleId = "GisProRibbonLayoutValidator_AddIn_Module";

    public static AddInModule? Current => FrameworkApplication.FindModule(ModuleId) as AddInModule;

    protected override bool CanUnload() => true;
}
