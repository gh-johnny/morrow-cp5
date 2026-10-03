import { useLocalSearchParams } from 'expo-router';
import { GroupForm } from '../../features/group-form';
export default function EditGroup() { const { id } = useLocalSearchParams<{ id: string }>(); return <GroupForm id={id} />; }
