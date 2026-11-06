// Added for Groupon Desk (fork of Paseo, Apache-2.0).
/** Manage named project sections without changing project registration or workspace ownership. */
import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { FormTextInput as TextInput } from "@/components/ui/form-field";
import type { EditingTextInputHandle } from "@/components/ui/text-input";
import { MenuRoot, MenuTrigger, MenuSurface, MenuItem } from "@/components/ui/menu";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { useSidebarWorkspacesList } from "@/hooks/use-sidebar-workspaces-list";
import { useProjectSectionsStore } from "./sidebar-project-sections-store";
import type { ProjectSection } from "./sidebar-project-sections";

function SectionEditor({
  section,
  first,
  last,
}: {
  section: ProjectSection;
  first: boolean;
  last: boolean;
}) {
  const [title, setTitle] = useState(section.title);
  const input = useRef<EditingTextInputHandle>(null);
  const rename = useProjectSectionsStore((state) => state.rename);
  const move = useProjectSectionsStore((state) => state.move);
  const remove = useProjectSectionsStore((state) => state.remove);
  const save = useCallback(() => {
    rename(section.id, title);
    const saved = title.trim() || section.title;
    setTitle(saved);
    input.current?.replaceText(saved);
  }, [rename, section.id, section.title, title]);
  const moveUp = useCallback(() => move(section.id, -1), [move, section.id]);
  const moveDown = useCallback(() => move(section.id, 1), [move, section.id]);
  const removeSection = useCallback(() => remove(section.id), [remove, section.id]);
  return (
    <View style={styles.editor}>
      <TextInput
        ref={input}
        initialValue={section.title}
        onChangeText={setTitle}
        onBlur={save}
        onSubmitEditing={save}
        maxLength={80}
        accessibilityLabel="Section name"
        style={styles.input}
      />
      <View style={styles.actions}>
        <Button
          variant="ghost"
          size="sm"
          disabled={first}
          onPress={moveUp}
          accessibilityLabel={`Move ${section.title} up`}
        >
          Move up
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={last}
          onPress={moveDown}
          accessibilityLabel={`Move ${section.title} down`}
        >
          Move down
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onPress={removeSection}
          accessibilityLabel={`Remove section ${section.title}`}
        >
          Remove
        </Button>
      </View>
    </View>
  );
}

export function ProjectSectionsSetting() {
  const sections = useProjectSectionsStore((state) => state.sections);
  const add = useProjectSectionsStore((state) => state.add);
  const { projects } = useSidebarWorkspacesList({ hostFilters: [] });
  const [title, setTitle] = useState("");
  const newInput = useRef<EditingTextInputHandle>(null);
  const create = useCallback(() => {
    if (!title.trim()) return;
    add(title);
    setTitle("");
    newInput.current?.reset();
  }, [add, title]);
  return (
    <SettingsSection
      title="Project sections"
      info="Add headings to the project view of the sidebar. Sections and assignments are saved on this device. Removing a section leaves its projects and chats in Other projects."
    >
      <View style={[settingsStyles.card, styles.body]}>
        {sections.map((section, index) => (
          <SectionEditor
            key={section.id}
            section={section}
            first={index === 0}
            last={index === sections.length - 1}
          />
        ))}
        <View style={styles.editor}>
          <TextInput
            ref={newInput}
            initialValue=""
            onChangeText={setTitle}
            onSubmitEditing={create}
            maxLength={80}
            placeholder="New section name"
            accessibilityLabel="New section name"
            style={styles.input}
          />
          <Button variant="secondary" size="sm" disabled={!title.trim()} onPress={create}>
            Add section
          </Button>
        </View>
        {sections.length
          ? projects.map((project) => (
              <ProjectAssignment
                key={project.viewKey}
                projectKey={project.viewKey}
                name={project.projectName}
                sections={sections}
              />
            ))
          : null}
      </View>
    </SettingsSection>
  );
}
function SectionChoice({
  projectKey,
  section,
  selected,
}: {
  projectKey: string;
  section: ProjectSection | null;
  selected: boolean;
}) {
  const assign = useProjectSectionsStore((state) => state.assign);
  const choose = useCallback(
    () => assign(projectKey, section?.id ?? null),
    [assign, projectKey, section?.id],
  );
  return (
    <MenuItem selected={selected} onSelect={choose}>
      {section?.title ?? "Other projects"}
    </MenuItem>
  );
}
function ProjectAssignment({
  projectKey,
  name,
  sections,
}: {
  projectKey: string;
  name: string;
  sections: ProjectSection[];
}) {
  const selected = sections.find((section) => section.projectKeys.includes(projectKey));
  return (
    <View style={styles.assignment}>
      <Text style={settingsStyles.rowTitle}>{name}</Text>
      <MenuRoot compactMode="sheet">
        <MenuTrigger accessibilityLabel={`Section for ${name}`}>
          <Text style={styles.value}>{selected?.title ?? "Other projects"}</Text>
        </MenuTrigger>
        <MenuSurface sheetTitle={`Section for ${name}`}>
          <SectionChoice projectKey={projectKey} section={null} selected={!selected} />
          {sections.map((section) => (
            <SectionChoice
              key={section.id}
              projectKey={projectKey}
              section={section}
              selected={selected?.id === section.id}
            />
          ))}
        </MenuSurface>
      </MenuRoot>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: { padding: theme.spacing[3], gap: theme.spacing[3] },
  editor: { gap: theme.spacing[2] },
  input: { minWidth: 0 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing[1] },
  assignment: { gap: theme.spacing[2], paddingVertical: theme.spacing[2] },
  value: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    paddingVertical: theme.spacing[2],
  },
}));
