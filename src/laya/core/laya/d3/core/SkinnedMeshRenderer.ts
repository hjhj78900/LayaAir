import { Event } from "laya/events/Event";
import { LayaGL } from "laya/layagl/LayaGL";
import { Render } from "laya/renders/Render";
import { Stat } from "laya/utils/Stat";
import { AnimationNode } from "../animation/AnimationNode";
import { Animator } from "../component/Animator";
import { FrustumCulling } from "../graphics/FrustumCulling";
import { Matrix4x4 } from "../math/Matrix4x4";
import { Vector3 } from "../math/Vector3";
import { Mesh } from "../resource/models/Mesh";
import { SubMesh } from "../resource/models/SubMesh";
import { Utils3D } from "../utils/Utils3D";
import { Avatar } from "././Avatar";
import { Bounds } from "././Bounds";
import { MeshRenderer } from "././MeshRenderer";
import { RenderableSprite3D } from "././RenderableSprite3D";
import { Sprite3D } from "././Sprite3D";
import { Transform3D } from "././Transform3D";
import { RenderContext3D } from "./render/RenderContext3D";
import { RenderElement } from "./render/RenderElement";
import { SkinnedMeshSprite3DShaderDeclaration } from "./SkinnedMeshSprite3DShaderDeclaration";
	
	/**
	 * <code>SkinMeshRenderer</code> 类用于蒙皮渲染器。
	 */
	export class SkinnedMeshRenderer extends MeshRenderer {
		/**@private */
		private static _tempMatrix4x4:Matrix4x4 = new Matrix4x4();
		
		/**@private */
		private _cacheMesh:Mesh;
		/** @private */
		private _bones:Sprite3D[] = [];
		/** @private */
		 _skinnedData:any[];
		/** @private */
		private _skinnedDataLoopMarks:number[] = [];
		/**@private */
		private _localBounds:Bounds = new Bounds(Vector3._ZERO, Vector3._ZERO);
		/**@private */
		private _cacheAnimator:Animator;
		/**@private */
		private _cacheRootBone:Sprite3D;
		
		/**
		 * 获取局部边界。
		 * @return 边界。
		 */
		 get localBounds():Bounds {
			return this._localBounds;
		}
		
		/**
		 * 设置局部边界。
		 * @param value 边界
		 */
		 set localBounds(value:Bounds) {
			this._localBounds = value;
		}
		
		/**
		 * 获取根节点。
		 * @return 根节点。
		 */
		 get rootBone():Sprite3D {
			return this._cacheRootBone;
		}
		
		/**
		 * 设置根节点。
		 * @param value 根节点。
		 */
		 set rootBone(value:Sprite3D) {
			if (this._cacheRootBone != value) {
				if (this._cacheRootBone)
					this._cacheRootBone.transform.off(Event.TRANSFORM_CHANGED, this, this._boundChange);
				value.transform.on(Event.TRANSFORM_CHANGED, this, this._boundChange);
				this._cacheRootBone = value;
				this._boundChange();
			}
		}
		
		/**
		 * 用于蒙皮的骨骼。
		 */
		 get bones():Sprite3D[] {
			return this._bones;
		}
		
		/**
		 * 创建一个 <code>SkinnedMeshRender</code> 实例。
		 */
		constructor(owner:RenderableSprite3D){
			/*[DISABLE-ADD-VARIABLE-DEFAULT-VALUE]*/
			super(owner);
		}
		
		/**
		 * @private
		 */
		private _computeSkinnedDataForNative():void {
			if (this._cacheMesh && this._cacheAvatar/*兼容*/ || this._cacheMesh && !this._cacheAvatar) {
				var bindPoses:Matrix4x4[] = this._cacheMesh._inverseBindPoses;
				var meshBindPoseIndices:Uint16Array = this._cacheMesh._bindPoseIndices;
				var pathMarks:any[][] = this._cacheMesh._skinDataPathMarks;
				for (var i:number = 0, n:number = this._cacheMesh.subMeshCount; i < n; i++) {
					var subMeshBoneIndices:Uint16Array[] = ((<SubMesh>this._cacheMesh._getSubMesh(i) ))._boneIndicesList;
					var subData:Float32Array[] = this._skinnedData[i];
					for (var j:number = 0, m:number = subMeshBoneIndices.length; j < m; j++) {
						var boneIndices:Uint16Array = subMeshBoneIndices[j];
						if (this._cacheAvatar && Render.supportWebGLPlusAnimation)//[Native]
							this._computeSubSkinnedDataNative(this._cacheAnimator._animationNodeWorldMatrixs, this._cacheAnimationNodeIndices, this._cacheMesh._inverseBindPosesBuffer, boneIndices, meshBindPoseIndices, subData[j]);
						else
							this._computeSubSkinnedData(bindPoses, boneIndices, meshBindPoseIndices, subData[j], pathMarks);
					}
				}
			}
		}
		
		private _computeSkinnedData():void {
			if (this._cacheMesh && this._cacheAvatar/*兼容*/ || this._cacheMesh && !this._cacheAvatar) {
				var bindPoses:Matrix4x4[] = this._cacheMesh._inverseBindPoses;
				var meshBindPoseIndices:Uint16Array = this._cacheMesh._bindPoseIndices;
				var pathMarks:any[][] = this._cacheMesh._skinDataPathMarks;
				for (var i:number = 0, n:number = this._cacheMesh.subMeshCount; i < n; i++) {
					var subMeshBoneIndices:Uint16Array[] = ((<SubMesh>this._cacheMesh._getSubMesh(i) ))._boneIndicesList;
					var subData:Float32Array[] = this._skinnedData[i];
					for (var j:number = 0, m:number = subMeshBoneIndices.length; j < m; j++) {
						var boneIndices:Uint16Array = subMeshBoneIndices[j];
						this._computeSubSkinnedData(bindPoses, boneIndices, meshBindPoseIndices, subData[j], pathMarks);
					}
				}
			}
		}
		
		/**
		 * @private
		 */
		private _computeSubSkinnedData(bindPoses:Matrix4x4[], boneIndices:Uint16Array, meshBindPoseInices:Uint16Array, data:Float32Array, pathMarks:any[][]):void {
			for (var k:number = 0, q:number = boneIndices.length; k < q; k++) {
				var index:number = boneIndices[k];
				if (this._skinnedDataLoopMarks[index] === Stat.loopCount) {
					var p:any[] = pathMarks[index];
					var preData:Float32Array = this._skinnedData[p[0]][p[1]];
					var srcIndex:number = p[2] * 16;
					var dstIndex:number = k * 16;
					for (var d:number = 0; d < 16; d++)
						data[dstIndex + d] = preData[srcIndex + d];
				} else {
					if (!this._cacheAvatar) {
						var boneIndex:number = meshBindPoseInices[index];
						Utils3D._mulMatrixArray(this._bones[boneIndex].transform.worldMatrix.elements, bindPoses[boneIndex], data, k * 16);
					} else {//[兼容代码]
						Utils3D._mulMatrixArray(this._cacheAnimationNode[index].transform.getWorldMatrix(), bindPoses[meshBindPoseInices[index]], data, k * 16);
					}
					
					this._skinnedDataLoopMarks[index] = Stat.loopCount;
				}
			}
		}
		
		/**
		 * @private
		 */
		private _boundChange():void {
			this._boundsChange = true;
		}
		
		/**
		 *@inheritDoc
		 */
		/*override*/  _createRenderElement():RenderElement {
			return new RenderElement();
		}
		
		/**
		 *@inheritDoc
		 */
		/*override*/  _onMeshChange(value:Mesh):void {
			super._onMeshChange(value);
			this._cacheMesh = (<Mesh>value );
			
			var subMeshCount:number = value.subMeshCount;
			this._skinnedData = [];
			this._skinnedDataLoopMarks.length = ((<Mesh>value ))._bindPoseIndices.length;
			for (var i:number = 0; i < subMeshCount; i++) {
				var subBoneIndices:Uint16Array[] = ((<SubMesh>value._getSubMesh(i) ))._boneIndicesList;
				var subCount:number = subBoneIndices.length;
				var subData:Float32Array[] = this._skinnedData[i] = [];
				for (var j:number = 0; j < subCount; j++)
					subData[j] = new Float32Array(subBoneIndices[j].length * 16);
			}
			
			if (!this._bones)
				(this._cacheAvatar && value) && (this._getCacheAnimationNodes());//[兼容性]
		}
		
		/**
		 * @private
		 */
		 _setCacheAnimator(animator:Animator):void {
			this._cacheAnimator = animator;
			this._shaderValues.addDefine(SkinnedMeshSprite3DShaderDeclaration.SHADERDEFINE_BONE);
			this._setRootNode();//[兼容性API]
		}
		
		/**
		 * @inheritDoc
		 */
		/*override*/ protected _calculateBoundingBox():void {//TODO:是否可直接在boundingSphere属性计算优化
			if (!this._cacheAvatar) {
				if (this._cacheRootBone)
					this._localBounds._tranform(this._cacheRootBone.transform.worldMatrix, this._bounds);
				else
					this._localBounds._tranform(this._owner.transform.worldMatrix, this._bounds);
				
			} else {//[兼容性API]
				if (this._cacheAnimator && this._rootBone) {
					var worldMat:Matrix4x4 = SkinnedMeshRenderer._tempMatrix4x4;
					Utils3D.matrix4x4MultiplyMFM(((<Sprite3D>this._cacheAnimator.owner )).transform.worldMatrix, this._cacheRootAnimationNode.transform.getWorldMatrix(), worldMat);
					this._localBounds._tranform(worldMat, this._bounds);
				} else {
					super._calculateBoundingBox();
				}
			}
			if (Render.supportWebGLPlusCulling) {//[NATIVE]
				var min:Vector3 = this._bounds.getMin();
				var max:Vector3 = this._bounds.getMax();
				var buffer:Float32Array = FrustumCulling._cullingBuffer;
				buffer[this._cullingBufferIndex + 1] = min.x;
				buffer[this._cullingBufferIndex + 2] = min.y;
				buffer[this._cullingBufferIndex + 3] = min.z;
				buffer[this._cullingBufferIndex + 4] = max.x;
				buffer[this._cullingBufferIndex + 5] = max.y;
				buffer[this._cullingBufferIndex + 6] = max.z;
			}
		}
		
		/**
		 * @inheritDoc
		 */
		/*override*/  _renderUpdate(context:RenderContext3D, transform:Transform3D):void {
			if (this._cacheAnimator) {
				this._computeSkinnedData();
				if (!this._cacheAvatar) {
					this._shaderValues.setMatrix4x4(Sprite3D.WORLDMATRIX, Matrix4x4.DEFAULT);
				} else {//[兼容性]
					var aniOwnerTrans:Transform3D = ((<Sprite3D>this._cacheAnimator.owner ))._transform;
					this._shaderValues.setMatrix4x4(Sprite3D.WORLDMATRIX, aniOwnerTrans.worldMatrix);
				}
			} else {
				this._shaderValues.setMatrix4x4(Sprite3D.WORLDMATRIX, transform.worldMatrix);
			}
		}
		
		/**
		 * @inheritDoc
		 */
		/*override*/  _renderUpdateWithCamera(context:RenderContext3D, transform:Transform3D):void {
			var projectionView:Matrix4x4 = context.projectionViewMatrix;
			if (!this._cacheAvatar) {
				this._shaderValues.setMatrix4x4(Sprite3D.MVPMATRIX, projectionView);
			} else {//[兼容性]
				if (this._cacheAnimator) {
					var aniOwnerTrans:Transform3D = ((<Sprite3D>this._cacheAnimator.owner ))._transform;
					Matrix4x4.multiply(projectionView, aniOwnerTrans.worldMatrix, this._projectionViewWorldMatrix);
				} else {
					Matrix4x4.multiply(projectionView, transform.worldMatrix, this._projectionViewWorldMatrix);
				}
				this._shaderValues.setMatrix4x4(Sprite3D.MVPMATRIX, this._projectionViewWorldMatrix);
			}
		}
		
		/**
		 * @inheritDoc
		 */
		/*override*/  _destroy():void {
			super._destroy();
			if (!this._cacheAvatar) {
				(this._cacheRootBone) && (this._cacheRootBone.transform.off(Event.TRANSFORM_CHANGED, this, this._boundChange));
			} else {//[兼容性]
				if (this._cacheRootAnimationNode)
					this._cacheRootAnimationNode.transform.off(Event.TRANSFORM_CHANGED, this, this._boundChange);
			}
		}
		
		//-----------------------------------------------------------------------------------------------------------------------------------------------------------
		
		/**@private */
		 _rootBone:string;//[兼容性API]
		/**@private */
		private _cacheAvatar:Avatar;//[兼容性API]
		/**@private */
		private _cacheRootAnimationNode:AnimationNode;//[兼容性API]
		/** @private */
		private _cacheAnimationNode:AnimationNode[] = [];//[兼容性]
		
		/**
		 * @private
		 */
		 _setRootBone(name:string):void {//[兼容性API]
			this._rootBone = name;
			this._setRootNode();//[兼容性API]
		}
		
		/**
		 * @private
		 */
		private _setRootNode():void {//[兼容性API]
			var rootNode:AnimationNode;
			if (this._cacheAnimator && this._rootBone && this._cacheAvatar)
				rootNode = this._cacheAnimator._avatarNodeMap[this._rootBone];
			else
				rootNode = null;
			
			if (this._cacheRootAnimationNode != rootNode) {
				this._boundChange();
				if (this._cacheRootAnimationNode)
					this._cacheRootAnimationNode.transform.off(Event.TRANSFORM_CHANGED, this, this._boundChange);
				(rootNode) && (rootNode.transform.on(Event.TRANSFORM_CHANGED, this, this._boundChange));
				this._cacheRootAnimationNode = rootNode;
			}
		}
		
		/**
		 * @private
		 */
		private _getCacheAnimationNodes():void {//[兼容性API]
			var meshBoneNames:string[] = this._cacheMesh._boneNames;
			var bindPoseIndices:Uint16Array = this._cacheMesh._bindPoseIndices;
			var innerBindPoseCount:number = bindPoseIndices.length;
			
			if (!Render.supportWebGLPlusAnimation) {
				this._cacheAnimationNode.length = innerBindPoseCount;
				var nodeMap:any = this._cacheAnimator._avatarNodeMap;
				for (var i:number = 0; i < innerBindPoseCount; i++) {
					var node:AnimationNode = nodeMap[meshBoneNames[bindPoseIndices[i]]];
					this._cacheAnimationNode[i] = node;
				}
				
			} else {//[NATIVE]
				this._cacheAnimationNodeIndices = new Uint16Array(innerBindPoseCount);
				var nodeMapC:any = this._cacheAnimator._avatarNodeMap;
				for (i = 0; i < innerBindPoseCount; i++) {
					var nodeC:AnimationNode = nodeMapC[meshBoneNames[bindPoseIndices[i]]];
					this._cacheAnimationNodeIndices[i] = nodeC._worldMatrixIndex;
				}
			}
		}
		
		/**
		 * @private
		 */
		 _setCacheAvatar(value:Avatar):void {//[兼容性API]
			if (this._cacheAvatar !== value) {
				if (this._cacheMesh) {
					this._cacheAvatar = value;
					if (value) {
						this._shaderValues.addDefine(SkinnedMeshSprite3DShaderDeclaration.SHADERDEFINE_BONE);
						this._getCacheAnimationNodes();
					}
				} else {
					this._cacheAvatar = value;
				}
				this._setRootNode();
			}
		}
		
		/**@private	[NATIVE]*/
		private _cacheAnimationNodeIndices:Uint16Array;
		
		/**
		 * @private [NATIVE]
		 */
		private _computeSubSkinnedDataNative(worldMatrixs:Float32Array, cacheAnimationNodeIndices:Uint16Array, inverseBindPosesBuffer:ArrayBuffer, boneIndices:Uint16Array, bindPoseInices:Uint16Array, data:Float32Array):void {
			LayaGL.instance.computeSubSkinnedData(worldMatrixs, cacheAnimationNodeIndices, inverseBindPosesBuffer, boneIndices, bindPoseInices, data);
		}
	}

