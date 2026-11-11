// Signed-out visitors only need Auth. Load the database SDK after sign-in.
const repository = () => import('./firebaseRepository.js')

export async function listWorkouts() { return (await repository()).listWorkouts() }
export async function listMachines() { return (await repository()).listMachines() }
export async function saveWorkout(payload, id) { return (await repository()).saveWorkout(payload, id) }
export async function deleteWorkout(id) { return (await repository()).deleteWorkout(id) }
export async function saveMachine(payload) { return (await repository()).saveMachine(payload) }
export async function deleteMachine(id) { return (await repository()).deleteMachine(id) }
