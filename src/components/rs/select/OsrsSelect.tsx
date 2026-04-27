import { memo } from "react";
import Select, { GroupBase, OptionProps, Props, components, createFilter } from "react-select";

import "./OsrsSelect.css";

const SelectComponent = Select as any;

function OsrsSelectOption<Option, IsMulti extends boolean, Group extends GroupBase<Option>>({
    children,
    ...props
}: OptionProps<Option, IsMulti, Group>) {
    const { onMouseMove, onMouseOver, ...rest } = props.innerProps;
    const newProps = { ...props, innerProps: rest };
    return <components.Option {...newProps}>{children}</components.Option>;
}

export const OsrsSelect = memo(function OsrsSelect<
    Option,
    IsMulti extends boolean = false,
    Group extends GroupBase<Option> = GroupBase<Option>,
>(props: Props<Option, IsMulti, Group>) {
    return (
        <SelectComponent
            {...props}
            menuPlacement="auto"
            placeholder="Search"
            filterOption={createFilter({ ignoreAccents: false })}
            components={{
                DropdownIndicator: () => null,
                IndicatorSeparator: () => null,
                Option: OsrsSelectOption,
            }}
            classNames={{
                container: (_state: any) => "osrs-select-container",
                control: (_state: any) => "osrs-select-control",
                valueContainer: (_state: any) => "osrs-select-value-container",
                input: (_state: any) => "osrs-select-input",
                singleValue: (_state: any) => "osrs-select-single-value",
                placeholder: (_state: any) => "osrs-select-placeholder",
                menu: (_state: any) => "osrs-select-menu",
                menuList: (_state: any) => "osrs-select-menu-list",
                option: (_state: any) => "osrs-select-option",
                noOptionsMessage: (_state: any) => "osrs-select-no-options-message",
            }}
            theme={(theme: any) => ({
                ...theme,
                borderRadius: 0,
                colors: {
                    ...theme.colors,
                    primary75: "#787169",
                    primary50: "#787169",
                    // hover
                    primary25: "#787169",
                    // selected
                    primary: "#787169",
                    // normal
                    neutral0: "#3e3529",
                },
            })}
        />
    );
});
