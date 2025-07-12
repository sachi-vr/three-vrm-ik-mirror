/**
 * VRPlayerクラスは、VRMアバターとVRコントローラーの管理
 */
import * as THREE from 'three';
import { VRMHumanBoneName } from '@pixiv/three-vrm';
import { Avatar } from './Avatar';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

export class VRPlayer {
    // VRMアバターを管理。
    public avatar: Avatar;
    private _renderer: THREE.WebGLRenderer;
    private playerRig: THREE.Group;
    // WebXRのヘッドセット
    private _xrHeadset: THREE.Camera;
    // WebXRのコントローラー
    private _xrControllerLeft?: THREE.XRTargetRaySpace;
    private _xrCcontrollerRight?: THREE.XRTargetRaySpace;
    private _playerRotationOffset = new THREE.Quaternion();
    private speed = 2.0; // 移動速度
    private rotationSpeed = Math.PI; // 回転速度 (ラジアン/秒)

    constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, loader: GLTFLoader) {
        // プレイヤーリグを作成し、シーンに追加します。
        this.playerRig = new THREE.Group();
        scene.add(this.playerRig);
        // アバターを初期化し、プレイヤーリグの子として追加します。
        this.avatar = new Avatar(this.playerRig, loader);
        this._renderer = renderer;
        // WebXRヘッドセットのカメラを取得します。
        this._xrHeadset = this._renderer.xr.getCamera();

        // コントローラーを検出し、左右のコントローラーを特定します。
        for (let i = 0; i < 2; i++) {
            const controller = this._renderer.xr.getController(i);
            controller.addEventListener('connected', (event) => {
                if (event.data.handedness === 'left') {
                    this._xrControllerLeft = controller;
                } else if (event.data.handedness === 'right') {
                    this._xrCcontrollerRight = controller;
                }
            });
        }
    }

    /**
     * 指定されたURLからVRMモデルをロードします。
     * @param url ロードするVRMモデルのURL。
     */
    public async loadVRM(url: string) {
        await this.avatar.loadVRM(url);
    }

    /**
     * プレイヤーの状態を毎フレーム更新します。
     * @param delta 前のフレームからの経過時間（秒）。
     */
    public update(delta: number) {
        // VRMモデルがロードされていない、またはWebXRがプレゼンテーション中でない場合は更新をスキップします。
        if (!this.avatar.vrm || !this._renderer.xr.isPresenting) {
            return;
        }

        // 移動、回転、頭と手の更新を処理します。
        this._handleMovement(delta);
        this._handleRotation(delta);
        this._updateHead();
        this._updateHands();
    }

    /**
     * 左手コントローラーの入力に基づいてプレイヤーを移動させます。
     * @param delta 前のフレームからの経過時間（秒）。
     */
    private _handleMovement(delta: number) {
        // 左コントローラーがない場合は処理をスキップします。
        if (!this._xrControllerLeft) return;

        const session = this._renderer.xr.getSession();
        // セッションまたは入力ソースがない場合は処理をスキップします。
        if (!session || !session.inputSources) return;

        for (const source of session.inputSources) {
            // 左手コントローラーのゲームパッド入力を処理します。
            if (source.handedness === 'left' && source.gamepad) {
                const gamepad = source.gamepad;
                const xAxis = gamepad.axes[2];
                const yAxis = gamepad.axes[3];

                // スティックの傾きが閾値を超えている場合のみ移動を処理します。
                if (Math.abs(xAxis) > 0.1 || Math.abs(yAxis) > 0.1) {
                    const headQuaternion = new THREE.Quaternion();
                    this._xrHeadset.getWorldQuaternion(headQuaternion);

                    // ヘッドセットの向きに基づいて移動方向を計算します。
                    const moveDirection = new THREE.Vector3(xAxis, 0, yAxis);
                    moveDirection.applyQuaternion(headQuaternion);
                    moveDirection.y = 0; // Y軸方向の移動は無視します。
                    moveDirection.normalize();

                    // 移動量を計算し、プレイヤーリグの位置に直接加算します。
                    const moveAmount = moveDirection.multiplyScalar(this.speed * delta);
                    this.playerRig.position.add(moveAmount);
                }
            }
        }
    }

    /**
     * 右手コントローラーの入力に基づいてプレイヤーを回転させます。
     * @param delta 前のフレームからの経過時間（秒）。
     */
    private _handleRotation(delta: number) {
        // 右コントローラーがない場合は処理をスキップします。
        if (!this._xrCcontrollerRight) return;

        const session = this._renderer.xr.getSession();
        // セッションまたは入力ソースがない場合は処理をスキップします。
        if (!session || !session.inputSources) return;

        for (const source of session.inputSources) {
            // 右手コントローラーのゲームパッド入力を処理します。
            if (source.handedness === 'right' && source.gamepad) {
                const gamepad = source.gamepad;
                const xAxis = gamepad.axes[2];

                // スティックの傾きが閾値を超えている場合のみ回転を処理します。
                if (Math.abs(xAxis) > 0.1) {
                    const rotationAmount = -xAxis * this.rotationSpeed * delta;
                    const rotationQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationAmount);
                    // プレイヤーの回転オフセットを更新します。
                    this._playerRotationOffset.multiply(rotationQuaternion);
                }
            }
        }
    }

    /**
     * ヘッドセットの動きに基づいてアバターの頭部を更新します。
     */
    private _updateHead() {
        const vrm = this.avatar.vrm!;
        const headBone = vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Head);

        if (headBone) {
            const headsetWorldQuaternion = new THREE.Quaternion();
            this._xrHeadset.getWorldQuaternion(headsetWorldQuaternion);

            // プレイヤーリグのワールド回転を取得
            const playerRigWorldQuaternion = new THREE.Quaternion();
            this.playerRig.getWorldQuaternion(playerRigWorldQuaternion);

            // ヘッドセットのY軸（ヨー）回転のみを抽出します。
            const euler = new THREE.Euler().setFromQuaternion(headsetWorldQuaternion, 'YXZ');
            const yaw = euler.y;
            const headsetYawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

            // プレイヤーリグの位置と回転を更新します。
            // プレイヤーの回転オフセットとヘッドセットのヨーを合成します。
            // VRMの初期方向とVRの初期方向のずれを補正するため、Y軸周りに180度回転させます。
            const initialRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
            this.playerRig.quaternion.copy(this._playerRotationOffset).multiply(headsetYawQuat).multiply(initialRotation);

            // ヘッドセットのワールド座標を取得
            const headsetWorldPosition = new THREE.Vector3();
            this._xrHeadset.getWorldPosition(headsetWorldPosition);

            // プレイヤーリグのワールド座標を取得
            const playerRigWorldPosition = new THREE.Vector3();
            this.playerRig.getWorldPosition(playerRigWorldPosition);

            // ヘッドセットとプレイヤーリグのX, Z座標の差を計算
            const deltaX = headsetWorldPosition.x - playerRigWorldPosition.x;
            const deltaZ = headsetWorldPosition.z - playerRigWorldPosition.z;

            // プレイヤーリグのX, Z座標を更新
            this.playerRig.position.x += deltaX;
            this.playerRig.position.z += deltaZ;

            // ここから頭の傾きを適用するロジックを追加
            // ヘッドセットの回転をプレイヤーリグのワールド回転からの相対回転として取得
            const relativeHeadRotation = new THREE.Quaternion();
            relativeHeadRotation.copy(playerRigWorldQuaternion).invert().multiply(headsetWorldQuaternion);

            // 相対回転からヨー成分を除去し、ピッチとロールのみを抽出
            const headEuler = new THREE.Euler().setFromQuaternion(relativeHeadRotation, 'YXZ');
            headEuler.y = 0; // ヨー成分をゼロにする
            headEuler.x *= -1; // ピッチを反転
            headEuler.z *= -1; // ロールを反転
            const pitchRollQuaternion = new THREE.Quaternion().setFromEuler(headEuler);

            // 頭のボーンにピッチとロールの回転を適用
            // VRMの頭のボーンの初期姿勢を考慮する必要があるかもしれないが、
            // ここではシンプルに直接適用してみる
            headBone.quaternion.copy(pitchRollQuaternion);
        }
    }

    /**
     * コントローラーの動きに基づいてアバターの手を更新します。
     */
    private _updateHands() {
        const vrmIK = this.avatar.vrmIK;
        if (!vrmIK) return;

        vrmIK.ikChains.forEach(chain => {
            // 左手と右手に対応するIKチェーンを更新します。
            if (chain.effector.userData.vrmHumanBoneName === VRMHumanBoneName.LeftHand && this._xrControllerLeft) {
                this._updateHand(chain, this._xrControllerLeft);
            } else if (chain.effector.userData.vrmHumanBoneName === VRMHumanBoneName.RightHand && this._xrCcontrollerRight) {
                this._updateHand(chain, this._xrCcontrollerRight);
            }
        });
    }

    /**
     * 指定されたIKチェーンとコントローラーに基づいてアバターの手を更新します。
     * @param chain 更新するIKチェーン。
     * @param controller 手の目標位置と回転を提供するXRコントローラー。
     */
    private _updateHand(chain: any, controller: THREE.XRTargetRaySpace) {
        const vrm = this.avatar.vrm!;
        const goalPosition = new THREE.Vector3();
        const goalQuaternion = new THREE.Quaternion();

        // コントローラーのワールド位置と回転を取得します。
        controller.getWorldPosition(goalPosition);
        controller.getWorldQuaternion(goalQuaternion);

        // 目標位置をプレイヤーリグのローカル座標に変換します。
        this.playerRig.worldToLocal(goalPosition);

        // プレイヤーリグのワールド回転を取得し、目標回転に適用します。
        const parentRotation = new THREE.Quaternion();
        this.playerRig.getWorldQuaternion(parentRotation);
        goalQuaternion.premultiply(parentRotation.invert());

        // IKチェーンの目標位置と回転を設定します。
        chain.goal.position.copy(goalPosition);
        chain.goal.quaternion.copy(goalQuaternion);
    }
}
